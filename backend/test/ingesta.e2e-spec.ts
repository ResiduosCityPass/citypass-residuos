import * as request from 'supertest';
import { EstadoContenedor, Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * Flujo completo de ingesta contra PostgreSQL real (CU-01, CU-04, CU-05, CU-06).
 *
 * Es lo que ningun test unitario puede cubrir: las consultas de TypeORM, las
 * restricciones de unicidad, los indices y el comportamiento de las columnas
 * numeric, que Postgres devuelve como string.
 */
describe('Flujo de ingesta (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;

  const alta = async () => {
    const zona = await http
      .post('/api/v1/zonas')
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    const contenedor = await http
      .post('/api/v1/contenedores')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        zonaId: zona.body.id,
        tipoResiduo: TipoResiduo.RECICLABLE,
        capacidadLitros: 1100,
        lat: -34.6037,
        lng: -58.3816,
      })
      .expect(201);

    const sensor = await http
      .post(`/api/v1/contenedores/${contenedor.body.id}/sensor`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(201);

    return { zona: zona.body, contenedor: contenedor.body, apiKey: sensor.body.apiKey };
  };

  const reportar = (apiKey: string, datos: Record<string, unknown>) =>
    http.post('/api/v1/lecturas').set('X-Sensor-Key', apiKey).send(datos);

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
  });

  it('persiste la lectura y desnormaliza el estado sobre el contenedor', async () => {
    const { contenedor, apiKey } = await alta();

    await reportar(apiKey, { nivelLlenadoPct: 42.5, temperaturaC: 21.3, bateriaPct: 90 }).expect(
      202,
    );

    const detalle = await http
      .get(`/api/v1/contenedores/${contenedor.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    // Las columnas numeric vuelven de Postgres como string: si el transformer
    // no estuviera, esto seria "42.50" y la comparacion de CU-05 fallaria.
    expect(detalle.body.nivelLlenadoPct).toBe(42.5);
    expect(typeof detalle.body.nivelLlenadoPct).toBe('number');
    expect(detalle.body.estado).toBe(EstadoContenedor.NORMAL);
  });

  it('CU-05: alerta una sola vez al cruzar el umbral, no en cada lectura', async () => {
    const { apiKey } = await alta();

    const primera = await reportar(apiKey, {
      nivelLlenadoPct: 76,
      temperaturaC: 21,
      bateriaPct: 90,
    }).expect(202);
    const segunda = await reportar(apiKey, {
      nivelLlenadoPct: 87,
      temperaturaC: 21,
      bateriaPct: 90,
    }).expect(202);
    const tercera = await reportar(apiKey, {
      nivelLlenadoPct: 94,
      temperaturaC: 21,
      bateriaPct: 90,
    }).expect(202);

    expect(primera.body.estadoAnterior).toBe(EstadoContenedor.NORMAL);
    expect(primera.body.estadoNuevo).toBe(EstadoContenedor.CRITICO);
    expect(primera.body.alertasGeneradas).toContain('SATURACION');
    expect(segunda.body.alertasGeneradas).not.toContain('SATURACION');
    expect(tercera.body.alertasGeneradas).not.toContain('SATURACION');

    const alertas = await http
      .get('/api/v1/alertas?tipo=SATURACION')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    expect(alertas.body).toHaveLength(1);
  });

  it('CU-06: el incendio no depende del llenado', async () => {
    const { apiKey } = await alta();

    const respuesta = await reportar(apiKey, {
      nivelLlenadoPct: 8,
      temperaturaC: 88,
      bateriaPct: 90,
    }).expect(202);

    expect(respuesta.body.estadoNuevo).toBe(EstadoContenedor.NORMAL);
    expect(respuesta.body.alertasGeneradas).toContain('INCENDIO');
  });

  it('el listado de alertas trae el codigo del contenedor resuelto por la base', async () => {
    const { contenedor, apiKey } = await alta();
    await reportar(apiKey, { nivelLlenadoPct: 80, temperaturaC: 21, bateriaPct: 90 }).expect(202);

    const alertas = await http
      .get('/api/v1/alertas')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    expect(alertas.body[0].contenedorCodigo).toBe(contenedor.codigo);
  });

  it('rechaza una lectura fuera de orden cronologico', async () => {
    const { apiKey } = await alta();
    await reportar(apiKey, {
      nivelLlenadoPct: 40,
      temperaturaC: 21,
      bateriaPct: 90,
      registradaEn: '2026-09-02T14:00:00.000Z',
    }).expect(202);

    const respuesta = await reportar(apiKey, {
      nivelLlenadoPct: 45,
      temperaturaC: 21,
      bateriaPct: 90,
      registradaEn: '2026-09-02T13:00:00.000Z',
    }).expect(409);

    expect(respuesta.body.code).toBe('LECTURA_FUERA_DE_ORDEN');
  });

  it('la API key del sensor nunca sale en una respuesta', async () => {
    const { contenedor } = await alta();

    const detalle = await http
      .get(`/api/v1/contenedores/${contenedor.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    // `select: false` en la entidad: la columna existe pero no se selecciona.
    expect(detalle.body.sensor).toBeDefined();
    expect(detalle.body.sensor).not.toHaveProperty('apiKeyHash');
    expect(JSON.stringify(detalle.body)).not.toContain('apiKeyHash');
  });

  it('rechaza una API key que no corresponde a ningun sensor', async () => {
    await alta();

    const respuesta = await reportar('clave-inventada', {
      nivelLlenadoPct: 40,
      temperaturaC: 21,
      bateriaPct: 90,
    }).expect(401);

    expect(respuesta.body.code).toBe('SENSOR_KEY_INVALIDA');
  });

  it('la restriccion de unicidad de la zona la aplica la base', async () => {
    await alta();

    const respuesta = await http
      .post('/api/v1/zonas')
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: 'Centro', umbralCriticoPct: 80, umbralTemperaturaC: 60 })
      .expect(409);

    expect(respuesta.body.code).toBe('ZONA_NOMBRE_DUPLICADO');
  });

  it('no deja borrar una zona con contenedores', async () => {
    const { zona } = await alta();

    const respuesta = await http
      .delete(`/api/v1/zonas/${zona.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(409);

    expect(respuesta.body.code).toBe('ZONA_CON_CONTENEDORES');
  });
});
