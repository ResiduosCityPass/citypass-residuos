import * as request from 'supertest';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * CU-12 contra PostgreSQL real.
 *
 * Verifica que la ventana de lecturas se traiga en el orden correcto: el
 * repositorio las pide DESC y el modelo las necesita cronologicas. Con un mock
 * eso se puede simular; contra la base se comprueba.
 */
describe('Prediccion de saturacion (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;

  const QUINCE_MIN = 15 * 60 * 1000;

  const prepararConHistorial = async (niveles: number[]) => {
    const zona = await http
      .post('/api/v1/zonas')
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: `Zona ${Date.now()}`, umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    const contenedor = await http
      .post('/api/v1/contenedores')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        zonaId: zona.body.id,
        tipoResiduo: TipoResiduo.COMUN,
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

    const arranque = Date.now() - niveles.length * QUINCE_MIN;

    for (const [i, nivel] of niveles.entries()) {
      await http
        .post('/api/v1/lecturas')
        .set('X-Sensor-Key', sensor.body.apiKey)
        .send({
          nivelLlenadoPct: nivel,
          temperaturaC: 21,
          bateriaPct: 90,
          registradaEn: new Date(arranque + i * QUINCE_MIN).toISOString(),
        })
        .expect(202);
    }

    return contenedor.body;
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

  it('estima la tasa de llenado sobre el historico real', async () => {
    // 10, 15, 20... cada 15 minutos: 20 puntos por hora.
    const contenedor = await prepararConHistorial([10, 15, 20, 25, 30, 35, 40]);

    const respuesta = await http
      .get(`/api/v1/contenedores/${contenedor.id}/prediccion`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    expect(respuesta.body.tasaLlenadoPctPorHora).toBeCloseTo(20, 1);
    expect(respuesta.body.confianza).toBeCloseTo(1, 2);
    // Del 40% al 70% a 20 puntos por hora: hora y media.
    expect(respuesta.body.horasHastaUmbral).toBeCloseTo(1.5, 1);
  });

  it('ajusta solo sobre el ciclo posterior al ultimo vaciado', async () => {
    const contenedor = await prepararConHistorial([50, 60, 70, 80, 5, 12, 19, 26]);

    const respuesta = await http
      .get(`/api/v1/contenedores/${contenedor.id}/prediccion`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    // Solo las cuatro posteriores al vaciado, no las ocho.
    expect(respuesta.body.muestrasUsadas).toBe(4);
    expect(respuesta.body.tasaLlenadoPctPorHora).toBeGreaterThan(0);
  });

  it('devuelve 409 si el contenedor no tiene lecturas', async () => {
    const contenedor = await prepararConHistorial([]);

    const respuesta = await http
      .get(`/api/v1/contenedores/${contenedor.id}/prediccion`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(409);

    expect(respuesta.body.code).toBe('SIN_LECTURAS_SUFICIENTES');
  });

  it('devuelve 409 si el contenedor se esta vaciando', async () => {
    const contenedor = await prepararConHistorial([60, 55, 50, 45, 40]);

    const respuesta = await http
      .get(`/api/v1/contenedores/${contenedor.id}/prediccion`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(409);

    expect(respuesta.body.code).toBe('TENDENCIA_NO_CRECIENTE');
  });
});
