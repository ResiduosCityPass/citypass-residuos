import * as request from 'supertest';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * CU-11 contra PostgreSQL real.
 *
 * Es el unico lugar donde se puede verificar la formula de Haversine: vive en
 * SQL, asi que ningun test unitario la toca. Las distancias esperadas se
 * calcularon aparte con la formula estandar.
 */
describe('Consulta ciudadana (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;

  const OBELISCO = { lat: -34.6037, lng: -58.3816 };

  const crearContenedor = async (
    lat: number,
    lng: number,
    tipoResiduo = TipoResiduo.RECICLABLE,
  ) => {
    const zonas = await http.get('/api/v1/zonas').set('Authorization', `Bearer ${admin}`);
    const zonaId =
      zonas.body[0]?.id ??
      (
        await http
          .post('/api/v1/zonas')
          .set('Authorization', `Bearer ${admin}`)
          .send({ nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      ).body.id;

    const respuesta = await http
      .post('/api/v1/contenedores')
      .set('Authorization', `Bearer ${admin}`)
      .send({ zonaId, tipoResiduo, capacidadLitros: 1100, lat, lng })
      .expect(201);

    return respuesta.body;
  };

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

  it('responde sin token', async () => {
    await crearContenedor(OBELISCO.lat, OBELISCO.lng);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}`)
      .expect(200);
  });

  it('devuelve 0 metros para un contenedor en el punto exacto, no NaN', async () => {
    await crearContenedor(OBELISCO.lat, OBELISCO.lng);

    const respuesta = await http
      .get(`/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}`)
      .expect(200);

    // Sin el least/greatest sobre el argumento del acos, el coseno de la
    // distancia de un punto a si mismo puede dar 1.0000001 y devolver NaN.
    expect(respuesta.body[0].distanciaMetros).toBe(0);
  });

  it('calcula la distancia con precision de metros', async () => {
    // Un grado de latitud son ~111.195 m. 0,009 grados ~ 1000 m.
    await crearContenedor(OBELISCO.lat - 0.009, OBELISCO.lng);

    const respuesta = await http
      .get(
        `/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}&radioMetros=2000`,
      )
      .expect(200);

    expect(respuesta.body[0].distanciaMetros).toBeGreaterThan(995);
    expect(respuesta.body[0].distanciaMetros).toBeLessThan(1005);
  });

  it('ordena por distancia ascendente', async () => {
    await crearContenedor(OBELISCO.lat - 0.018, OBELISCO.lng);
    await crearContenedor(OBELISCO.lat - 0.0045, OBELISCO.lng);
    await crearContenedor(OBELISCO.lat - 0.009, OBELISCO.lng);

    const respuesta = await http
      .get(
        `/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}&radioMetros=5000`,
      )
      .expect(200);

    const distancias = respuesta.body.map((c: { distanciaMetros: number }) => c.distanciaMetros);
    expect(distancias).toEqual([...distancias].sort((a, b) => a - b));
  });

  it('el radio filtra en la consulta', async () => {
    await crearContenedor(OBELISCO.lat - 0.0045, OBELISCO.lng);
    await crearContenedor(OBELISCO.lat - 0.018, OBELISCO.lng);

    const cerca = await http
      .get(
        `/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}&radioMetros=1000`,
      )
      .expect(200);
    const lejos = await http
      .get(
        `/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}&radioMetros=5000`,
      )
      .expect(200);

    expect(cerca.body).toHaveLength(1);
    expect(lejos.body).toHaveLength(2);
  });

  it('no expone informacion operativa interna', async () => {
    await crearContenedor(OBELISCO.lat, OBELISCO.lng);

    const respuesta = await http
      .get(`/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}`)
      .expect(200);

    expect(Object.keys(respuesta.body[0]).sort()).toEqual([
      'codigo',
      'distanciaMetros',
      'id',
      'lat',
      'lng',
      'tipoResiduo',
    ]);
  });

  it('filtra por tipo de residuo', async () => {
    await crearContenedor(OBELISCO.lat, OBELISCO.lng, TipoResiduo.COMUN);
    await crearContenedor(OBELISCO.lat - 0.001, OBELISCO.lng, TipoResiduo.RECICLABLE);

    const respuesta = await http
      .get(
        `/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}&tipoResiduo=RECICLABLE`,
      )
      .expect(200);

    expect(respuesta.body).toHaveLength(1);
    expect(respuesta.body[0].tipoResiduo).toBe(TipoResiduo.RECICLABLE);
  });

  it('devuelve lista vacia si no hay nada cerca, no un error', async () => {
    await crearContenedor(-34.9, -58.9);

    const respuesta = await http
      .get(
        `/api/v1/publico/contenedores/cercanos?lat=${OBELISCO.lat}&lng=${OBELISCO.lng}&radioMetros=500`,
      )
      .expect(200);

    expect(respuesta.body).toEqual([]);
  });
});
