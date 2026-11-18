import * as request from 'supertest';
import { Rol } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

describe('Simulacion de lecturas administrativa (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;
  let id: string;
  let apiKey: string;
  const url = () => `/api/v1/contenedores/${id}/lecturas/simulacion`;
  const datos = { nivelLlenadoPct: 90, confirmar: true };

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = ctx.token(Rol.ADMINISTRADOR);
  });
  afterAll(async () => {
    await ctx.cerrar();
  });
  beforeEach(async () => {
    await ctx.limpiar();
    const zona = await http
      .post('/api/v1/zonas')
      .auth(admin, { type: 'bearer' })
      .send({ nombre: 'Prueba lectura', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);
    const contenedor = await http
      .post('/api/v1/contenedores')
      .auth(admin, { type: 'bearer' })
      .send({
        zonaId: zona.body.id,
        tipoResiduo: 'COMUN',
        capacidadLitros: 1100,
        lat: -34.6037,
        lng: -58.3816,
      })
      .expect(201);
    id = contenedor.body.id;
    const sensor = await http
      .post(`/api/v1/contenedores/${id}/sensor`)
      .auth(admin, { type: 'bearer' })
      .send({})
      .expect(201);
    apiKey = sensor.body.apiKey;
  });

  it('un admin simula sin clave IoT y genera historial, estado, alerta y outbox reales', async () => {
    const response = await http.post(url()).auth(admin, { type: 'bearer' }).send(datos).expect(202);
    expect(response.body).toMatchObject({
      contenedorId: id,
      estadoAnterior: 'NORMAL',
      estadoNuevo: 'CRITICO',
      alertasGeneradas: ['SATURACION'],
    });
    expect(JSON.stringify(response.body)).not.toContain(apiKey);
    const detalle = await http
      .get(`/api/v1/contenedores/${id}`)
      .auth(admin, { type: 'bearer' })
      .expect(200);
    expect(detalle.body).toMatchObject({
      nivelLlenadoPct: 90,
      temperaturaC: 20,
      sensor: { bateriaPct: 100 },
    });
    const filas = await ctx.dataSource.query(
      'SELECT count(*)::int cantidad FROM lectura WHERE "contenedorId" = $1',
      [id],
    );
    expect(filas[0].cantidad).toBe(1);
    const outbox = await ctx.dataSource.query('SELECT "eventType" FROM evento_pendiente');
    expect(outbox).toContainEqual({ eventType: 'residuos.contenedor.critico' });
  });

  it.each([Rol.OPERADOR, Rol.CHOFER, Rol.CIUDADANO])(
    'rechaza el rol %s aunque confirme',
    async (rol) => {
      await http.post(url()).auth(ctx.token(rol), { type: 'bearer' }).send(datos).expect(403);
      expect(
        (await ctx.dataSource.query('SELECT count(*)::int cantidad FROM lectura'))[0].cantidad,
      ).toBe(0);
    },
  );

  it('no permite autenticar la simulacion con la clave de un sensor ni sin sesion', async () => {
    await http.post(url()).send(datos).expect(401);
    await http.post(url()).set('X-Sensor-Key', apiKey).send(datos).expect(401);
  });

  it.each([
    { nivelLlenadoPct: 90 },
    { ...datos, confirmar: false },
    { ...datos, confirmar: 'true' },
    { ...datos, nivelLlenadoPct: -1 },
    { ...datos, nivelLlenadoPct: 101 },
    { ...datos, nivelLlenadoPct: 1.234 },
    { ...datos, nivelLlenadoPct: '90' },
    { ...datos, registradaEn: new Date().toISOString() },
    { ...datos, sensorId: 'otro' },
  ])('rechaza datos invalidos sin escribir: %j', async (body) => {
    await http.post(url()).auth(admin, { type: 'bearer' }).send(body).expect(400);
    expect(
      (await ctx.dataSource.query('SELECT count(*)::int cantidad FROM lectura'))[0].cantidad,
    ).toBe(0);
  });

  it('mantiene la temperatura y bateria de una lectura real anterior', async () => {
    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', apiKey)
      .send({ nivelLlenadoPct: 10, temperaturaC: 23.5, bateriaPct: 63 })
      .expect(202);
    await http.post(url()).auth(admin, { type: 'bearer' }).send(datos).expect(202);
    const detalle = await http.get(`/api/v1/contenedores/${id}`).auth(admin, { type: 'bearer' });
    expect(detalle.body).toMatchObject({ temperaturaC: 23.5, sensor: { bateriaPct: 63 } });
  });

  it('registrar cero no confirma un vaciado', async () => {
    await http
      .post(url())
      .auth(admin, { type: 'bearer' })
      .send({ nivelLlenadoPct: 0, confirmar: true })
      .expect(202);
    const outbox = await ctx.dataSource.query('SELECT "eventType" FROM evento_pendiente');
    expect(outbox).not.toContainEqual({ eventType: 'residuos.contenedor.vaciado' });
  });

  it('valida el UUID de la URL', async () => {
    await http
      .post('/api/v1/contenedores/no-uuid/lecturas/simulacion')
      .auth(admin, { type: 'bearer' })
      .send(datos)
      .expect(400);
  });
});
