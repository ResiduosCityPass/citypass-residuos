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

  const bloquearAMano = (zonaId: string) =>
    http.patch(`/api/v1/zonas/${zonaId}/bloqueo?bloqueada=true`).set(auth(admin)).expect(200);

  it('una zona bloqueada a mano antes de la emergencia sigue bloqueada cuando termina', async () => {
    const zonaId = await zonaConContenedor();
    await bloquearAMano(zonaId);

    await emergenciaCreada('em-1', 'ev-1');
    await emergenciaResuelta('em-1', 'ev-2');

    expect(await bloqueada(zonaId)).toBe(true);
  });

  it('una zona bloqueada a mano durante la emergencia sigue bloqueada cuando termina', async () => {
    const zonaId = await zonaConContenedor();

    await emergenciaCreada('em-1', 'ev-1');
    await bloquearAMano(zonaId);
    await emergenciaResuelta('em-1', 'ev-2');

    expect(await bloqueada(zonaId)).toBe(true);
  });

  describe('intervencion por emergencia con causa RESIDUOS (CU-01, A7)', () => {
    const resuelta = (eventId: string, causasRelacionadas: string[], tipo = 'EmergenciaResuelta') =>
      http
        .post(webhook)
        .send({
          metadata: { eventId, eventType: `com.citypass.emergencias.${tipo}` },
          data: {
            emergenciaId: 'EMG-1',
            causasRelacionadas,
            ubicacion: PLAZA_ITALIA,
          },
        })
        .expect(204);

    const intervenciones = async () =>
      (await http.get('/api/v1/intervenciones').set(auth(admin)).expect(200)).body;

    it('con RESIDUOS programa la intervencion en el contenedor cercano', async () => {
      await zonaConContenedor();

      await resuelta('ev-1', ['RESIDUOS']);

      const lista = await intervenciones();
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ emergenciaId: 'EMG-1', estado: 'PROGRAMADA' });
      expect(lista[0].contenedorId).not.toBeNull();
    });

    it('con VIA no hace nada', async () => {
      await zonaConContenedor();

      await resuelta('ev-1', ['VIA']);

      expect(await intervenciones()).toHaveLength(0);
    });

    it('la misma emergencia por dos eventos distintos programa una sola intervencion', async () => {
      await zonaConContenedor();

      await resuelta('ev-1', ['RESIDUOS'], 'EmergenciaResuelta');
      await resuelta('ev-2', ['RESIDUOS'], 'EmergenciaActualizada');

      expect(await intervenciones()).toHaveLength(1);
    });

    it('sin contenedores cerca la intervencion se programa igual', async () => {
      await resuelta('ev-1', ['RESIDUOS']);

      const lista = await intervenciones();
      expect(lista).toHaveLength(1);
      expect(lista[0].contenedorId).toBeNull();
    });
  });

  it('una reentrega de un evento ya procesado no vuelve a bloquear la zona', async () => {
    const zonaId = await zonaConContenedor();

    await emergenciaCreada('em-1', 'ev-1');
    await emergenciaResuelta('em-1', 'ev-2');
    await emergenciaCreada('em-1', 'ev-1');

    expect(await bloqueada(zonaId)).toBe(false);
  });
});
