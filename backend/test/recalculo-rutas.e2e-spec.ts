import * as request from 'supertest';
import { ParadasService } from '../src/modules/rutas/application/paradas.service';
import { EstadoParada, EstadoRuta, Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * CU-INT-02 — Recalcular una ruta viva porque un auto tapa uno de sus
 * contenedores, contra PostgreSQL real.
 *
 * La busqueda de rutas afectadas, el borrado de paradas y la transaccion viven
 * en SQL: un doble en memoria no probaria nada de eso.
 */
describe('Recalculo de rutas por obstruccion (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;
  let paradas: ParadasService;

  const DEPOSITO = { lat: -34.6037, lng: -58.3816 };
  const MOTIVO = 'Acceso bloqueado por vehiculo (reclamo RC-123)';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  interface ParadaRespuesta {
    contenedorId: string;
    orden: number;
    estado: EstadoParada;
    motivo: string | null;
  }

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = ctx.token(Rol.ADMINISTRADOR);
    paradas = ctx.app.get(ParadasService);
  });

  afterAll(() => ctx.cerrar());
  beforeEach(() => ctx.limpiar());

  /** Tres contenedores criticos en fila hacia el sur y una propuesta que los recorre. */
  async function propuestaConTresParadas(): Promise<{ rutaId: string; contenedorIds: string[] }> {
    const zona = await http
      .post('/api/v1/zonas')
      .set(auth(admin))
      .send({ nombre: `Centro ${Date.now()}`, umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    const contenedorIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const contenedor = await http
        .post('/api/v1/contenedores')
        .set(auth(admin))
        .send({
          zonaId: zona.body.id,
          tipoResiduo: TipoResiduo.RECICLABLE,
          capacidadLitros: 1100,
          lat: DEPOSITO.lat - 0.002 * i,
          lng: DEPOSITO.lng,
        })
        .expect(201);

      const sensor = await http
        .post(`/api/v1/contenedores/${contenedor.body.id}/sensor`)
        .set(auth(admin))
        .send({})
        .expect(201);

      await http
        .post('/api/v1/lecturas')
        .set('X-Sensor-Key', sensor.body.apiKey)
        .send({ nivelLlenadoPct: 88, temperaturaC: 21, bateriaPct: 90 })
        .expect(202);

      contenedorIds.push(contenedor.body.id);
    }

    const camion = await http
      .post('/api/v1/camiones')
      .set(auth(admin))
      .send({
        patente: `AB${Date.now().toString().slice(-3)}CD`,
        capacidadLitros: 12_000,
        tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
      })
      .expect(201);

    const ruta = await http
      .post('/api/v1/rutas/generar')
      .set(auth(admin))
      .send({ camionId: camion.body.id })
      .expect(201);

    return { rutaId: ruta.body.id, contenedorIds };
  }

  async function detalle(rutaId: string) {
    const ruta = await http.get(`/api/v1/rutas/${rutaId}`).set(auth(admin)).expect(200);
    return ruta.body as { estado: EstadoRuta; paradas: ParadaRespuesta[] };
  }

  it('en una propuesta, saca la parada tapada y renumera las demas', async () => {
    const { rutaId, contenedorIds } = await propuestaConTresParadas();
    const [primero, tapado, tercero] = contenedorIds;

    const afectadas = await paradas.quitarContenedores([tapado], MOTIVO);

    expect(afectadas).toEqual([rutaId]);
    const ruta = await detalle(rutaId);
    expect(ruta.estado).toBe(EstadoRuta.PROPUESTA);
    expect(ruta.paradas.map((p) => [p.contenedorId, p.orden])).toEqual([
      [primero, 1],
      [tercero, 2],
    ]);
  });

  it('en una ruta asignada, la parada queda OMITIDA con el motivo y las demas siguen', async () => {
    const { rutaId, contenedorIds } = await propuestaConTresParadas();
    const tapado = contenedorIds[1];

    const chofer = await http
      .post('/api/v1/choferes')
      .set(auth(admin))
      .send({ nombre: 'Juana Perez', legajo: `CH-${Date.now().toString().slice(-8)}` })
      .expect(201);
    await http
      .patch(`/api/v1/rutas/${rutaId}/asignar`)
      .set(auth(admin))
      .send({ choferId: chofer.body.id })
      .expect(200);

    await paradas.quitarContenedores([tapado], MOTIVO);

    const ruta = await detalle(rutaId);
    const omitida = ruta.paradas.find((p) => p.contenedorId === tapado);
    expect(omitida).toEqual(
      expect.objectContaining({ estado: EstadoParada.OMITIDA, motivo: MOTIVO }),
    );
    expect(ruta.paradas.filter((p) => p.estado === EstadoParada.PENDIENTE)).toHaveLength(2);
    // La omitio el sistema, no el chofer: la ruta no arranca.
    expect(ruta.estado).toBe(EstadoRuta.ASIGNADA);
  });

  it('un contenedor que no esta en ninguna ruta viva no cambia nada', async () => {
    await propuestaConTresParadas();

    expect(
      await paradas.quitarContenedores(['00000000-0000-0000-0000-000000000000'], MOTIVO),
    ).toEqual([]);
  });
});
