import * as request from 'supertest';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * CU-INT-01 — Bloqueo de zonas por emergencias, contra PostgreSQL real.
 *
 * Recorre el webhook de punta a punta: los eventos entran por HTTP, quedan en
 * las tablas de la integracion y el estado de la zona se lee por la API, sin
 * dobles en el medio.
 */
describe('Integracion CityPass+ (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;

  const PLAZA_ITALIA = { lat: -34.5811, lng: -58.421 };
  const webhook = `/api/v1/webhooks/citypass?token=${process.env.GATEWAY_WEBHOOK_TOKEN}`;

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = ctx.token(Rol.ADMINISTRADOR);
  });

  afterAll(() => ctx.cerrar());
  beforeEach(() => ctx.limpiar());

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Una zona con un contenedor en Plaza Italia. */
  async function zonaConContenedor(): Promise<string> {
    const zona = await http
      .post('/api/v1/zonas')
      .set(auth(admin))
      .send({ nombre: 'Palermo', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    await http
      .post('/api/v1/contenedores')
      .set(auth(admin))
      .send({
        zonaId: zona.body.id,
        tipoResiduo: TipoResiduo.COMUN,
        capacidadLitros: 1100,
        ...PLAZA_ITALIA,
      })
      .expect(201);

    return zona.body.id;
  }

  const emergenciaCreada = (emergenciaId: string, eventId: string) =>
    http
      .post(webhook)
      .send({
        metadata: { eventId, eventType: 'com.citypass.emergencias.EmergenciaCreada' },
        data: {
          emergenciaId,
          categoria: 'INCENDIO',
          latitud: PLAZA_ITALIA.lat,
          longitud: PLAZA_ITALIA.lng,
          afectaCirculacion: true,
        },
      })
      .expect(204);

  const emergenciaResuelta = (emergenciaId: string, eventId: string) =>
    http
      .post(webhook)
      .send({
        metadata: { eventId, eventType: 'com.citypass.emergencias.EmergenciaActualizada' },
        data: { emergenciaId, estadoNuevo: 'RESUELTA' },
      })
      .expect(204);

  const bloqueada = async (zonaId: string): Promise<boolean> =>
    (await http.get(`/api/v1/zonas/${zonaId}`).set(auth(admin)).expect(200)).body.bloqueada;

  it('con dos emergencias en la misma zona, sigue bloqueada hasta que terminan las dos', async () => {
    const zonaId = await zonaConContenedor();

    await emergenciaCreada('em-1', 'ev-1');
    expect(await bloqueada(zonaId)).toBe(true);

    await emergenciaCreada('em-2', 'ev-2');

    await emergenciaResuelta('em-1', 'ev-3');
    expect(await bloqueada(zonaId)).toBe(true);

    await emergenciaResuelta('em-2', 'ev-4');
    expect(await bloqueada(zonaId)).toBe(false);
  });

  it('una zona bloqueada a mano sigue bloqueada cuando termina la emergencia', async () => {
    const zonaId = await zonaConContenedor();
    await http.patch(`/api/v1/zonas/${zonaId}/bloqueo?bloqueada=true`).set(auth(admin)).expect(200);

    await emergenciaCreada('em-1', 'ev-1');
    await emergenciaResuelta('em-1', 'ev-2');

    expect(await bloqueada(zonaId)).toBe(true);
  });

  it('una reentrega de un evento ya procesado no vuelve a bloquear la zona', async () => {
    const zonaId = await zonaConContenedor();

    await emergenciaCreada('em-1', 'ev-1');
    await emergenciaResuelta('em-1', 'ev-2');
    await emergenciaCreada('em-1', 'ev-1');

    expect(await bloqueada(zonaId)).toBe(false);
  });
});
