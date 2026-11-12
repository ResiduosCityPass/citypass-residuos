import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';
import {
  CRITICIDAD_CONFIRMADA as INICIO,
  CRITICIDAD_FINALIZADA as FIN,
} from '../src/modules/contingencias/application/dto/criticidad-climatica.dto';
import { Rol } from '../src/shared/domain/enums';

describe('Contrato real de Espacios Publicos y revision de zonas (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: { Authorization: string };
  const start = (alertaId = randomUUID()) => ({
    alertaId,
    nivelCriticidad: 'ALTA',
    fenomeno: 'TORMENTA_FUERTE',
    ubicaciones: [{ latitud: -34.6037, longitud: -58.3816 }],
    vigenciaDesde: 1793311620000,
    vigenciaHasta: 1793333220000,
    actorSub: 'delegado-esp',
    temperaturaMinC: null,
    temperaturaMaxC: null,
  });
  const end = (alertaId: string) => ({
    alertaId,
    finalizadaEn: 1793333220000,
    actorSub: 'delegado-esp',
  });
  const receive = (tipo: string, payload: unknown) =>
    http.post('/api/v1/contingencias/clima/simulador').set(admin).send({ tipo, payload });
  const resolve = (id: string, zonaIds: string[]) =>
    http.patch(`/api/v1/contingencias/clima/${id}/resolver`).set(admin).send({
      accion: 'SUSPENDER',
      motivo: 'Operador confirma inundacion en las zonas seleccionadas',
      zonaIds,
    });
  const zone = async () =>
    (
      await http
        .post('/api/v1/zonas')
        .set(admin)
        .send({ nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
        .expect(201)
    ).body;
  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = { Authorization: `Bearer ${ctx.token()}` };
  });
  beforeEach(async () => {
    await ctx.limpiar();
  });
  afterAll(async () => {
    await ctx?.cerrar();
  });

  it.each(['TORMENTA_FUERTE', 'VIENTO_FUERTE'])(
    'recibe %s, revisa, suspende y recupera hasta el vaciado real del chofer',
    async (fenomeno) => {
      const z = await zone();
      const p = { ...start(), fenomeno };
      const cont = (
        await http
          .post('/api/v1/contenedores')
          .set(admin)
          .send({
            zonaId: z.id,
            tipoResiduo: 'COMUN',
            capacidadLitros: 1100,
            lat: -34.6037,
            lng: -58.3816,
          })
          .expect(201)
      ).body;
      await ctx.dataSource.query(
        'UPDATE contenedor SET "nivelLlenadoPct" = 90, estado = $2 WHERE id = $1',
        [cont.id, 'CRITICO'],
      );
      const truck = (
        await http
          .post('/api/v1/camiones')
          .set(admin)
          .send({ patente: 'AB123CD', capacidadLitros: 10000, tipoResiduoHabilitado: 'COMUN' })
          .expect(201)
      ).body;
      const driver = (
        await http
          .post('/api/v1/choferes')
          .set(admin)
          .send({ nombre: 'Juana Perez', legajo: 'CH001', usuarioSub: 'test-CHOFER' })
          .expect(201)
      ).body;
      const route = (
        await http.post('/api/v1/rutas/generar').set(admin).send({ camionId: truck.id }).expect(201)
      ).body;
      await http
        .patch(`/api/v1/rutas/${route.id}/asignar`)
        .set(admin)
        .send({ choferId: driver.id })
        .expect(200);
      await receive(INICIO, p).expect(201);
      expect((await http.get('/api/v1/zonas').set(admin)).body[0].restriccionesInundacion).toEqual(
        [],
      );
      const decision = (await resolve(p.alertaId, [z.id]).expect(200)).body;
      expect(decision.revisadoPor).toBe('test-ADMINISTRADOR');
      const authDriver = { Authorization: `Bearer ${ctx.token(Rol.CHOFER)}` };
      const my = (await http.get('/api/v1/rutas/mias').set(authDriver).expect(200)).body;
      expect(my.paradasSuspendidas).toBe(1);
      const confirm = () =>
        http
          .patch(`/api/v1/paradas/${my.paradas[0].id}/confirmar`)
          .set(authDriver)
          .send({ lat: -34.6037, lng: -58.3816 });
      await confirm().expect(409);
      // La vigencia estimada ya paso; la restriccion sigue hasta recibir el fin real.
      expect(
        (await http.get(`/api/v1/contingencias/${decision.contingenciaId}`).set(admin)).body.estado,
      ).toBe('ACTIVA');
      await receive(FIN, end(p.alertaId)).expect(201);
      expect(
        (await http.get('/api/v1/contingencias/clima').set(admin).expect(200)).body.alertas[0]
          .estadoContingencia,
      ).toBe('PENDIENTE_RECUPERACION');
      await confirm().expect(409);
      expect(
        (
          await http
            .patch(`/api/v1/contingencias/${decision.contingenciaId}/recuperar`)
            .set(admin)
            .expect(200)
        ).body.estado,
      ).toBe('EN_RECUPERACION');
      await confirm().expect(200);
      expect(
        (await http.get(`/api/v1/contingencias/${decision.contingenciaId}`).set(admin)).body.estado,
      ).toBe('RECUPERADA');
      expect(
        (await http.get('/api/v1/contingencias/clima').set(admin).expect(200)).body.alertas[0]
          .estadoContingencia,
      ).toBe('RECUPERADA');
    },
  );

  it('deduplica entregas concurrentes y mantiene un cierre recibido primero', async () => {
    const z = await zone();
    const p = start();
    await receive(FIN, end(p.alertaId)).expect(201);
    await Promise.all([receive(INICIO, p).expect(201), receive(INICIO, p).expect(201)]);
    const decision = (await resolve(p.alertaId, [z.id]).expect(200)).body;
    expect(
      (await http.get(`/api/v1/contingencias/${decision.contingenciaId}`).set(admin)).body.estado,
    ).toBe('PENDIENTE_RECUPERACION');
    const before = await ctx.dataSource.query('SELECT count(*)::int AS n FROM evento_pendiente');
    expect((await receive(FIN, end(p.alertaId)).expect(201)).body.duplicado).toBe(true);
    expect(await ctx.dataSource.query('SELECT count(*)::int AS n FROM evento_pendiente')).toEqual(
      before,
    );
    const history = (await http.get('/api/v1/contingencias/clima').set(admin).expect(200)).body;
    expect(history.alertas).toHaveLength(1);
    expect(history.alertas[0].confirmacion).toEqual(p);
  });

  it('un fallo al guardar la revision revierte tambien suspension, inbox y outbox', async () => {
    const z = await zone();
    const p = start();
    await receive(INICIO, p).expect(201);
    await ctx.dataSource.query(
      `CREATE FUNCTION qa_fallar_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.decision = 'SUSPENDER' THEN RAISE EXCEPTION 'qa rollback'; END IF; RETURN NEW; END; $$`,
    );
    await ctx.dataSource.query(
      'CREATE TRIGGER qa_revision BEFORE UPDATE ON alerta_climatica_externa FOR EACH ROW EXECUTE FUNCTION qa_fallar_revision()',
    );
    try {
      await resolve(p.alertaId, [z.id]).expect(500);
      expect(await ctx.dataSource.query('SELECT * FROM contingencia')).toHaveLength(0);
      expect(await ctx.dataSource.query('SELECT * FROM evento_climatico_recibido')).toHaveLength(0);
      expect(await ctx.dataSource.query('SELECT * FROM evento_pendiente')).toHaveLength(0);
      expect(
        (await http.get('/api/v1/contingencias/clima').set(admin)).body.alertas[0].decision,
      ).toBe('PENDIENTE_REVISION');
    } finally {
      await ctx.dataSource.query('DROP TRIGGER qa_revision ON alerta_climatica_externa');
      await ctx.dataSource.query('DROP FUNCTION qa_fallar_revision()');
    }
    await resolve(p.alertaId, [z.id]).expect(200);
  });

  it('rechaza IDs de zonas desconocidos y mensajes que cambian una etapa existente', async () => {
    const p = start();
    await receive(INICIO, p).expect(201);
    await resolve(p.alertaId, [randomUUID()]).expect(400);
    await receive(INICIO, { ...p, nivelCriticidad: 'OTRA' }).expect(409);
    expect(await ctx.dataSource.query('SELECT * FROM contingencia')).toHaveLength(0);
    expect(
      (await http.get('/api/v1/contingencias/clima').set(admin)).body.alertas[0].decision,
    ).toBe('PENDIENTE_REVISION');
  });

  it('no requiere zonas para un mensaje final y rechaza coordenadas invalidas', async () => {
    await receive(FIN, end(randomUUID())).expect(201);
    await receive(INICIO, { ...start(), ubicaciones: [{ latitud: 100, longitud: -58 }] }).expect(
      400,
    );
    const p = start();
    await receive(INICIO, p).expect(201);
    await http
      .patch(`/api/v1/contingencias/clima/${p.alertaId}/resolver`)
      .set(admin)
      .send({ accion: 'SIN_AFECTACION', motivo: 'No hay inundacion en las zonas de recoleccion' })
      .expect(200);
    await receive(FIN, end(p.alertaId)).expect(201);
    expect(await ctx.dataSource.query('SELECT * FROM contingencia')).toHaveLength(0);
  });

  it('protege recepcion local y revision: no son un webhook publico', async () => {
    await http.get('/api/v1/contingencias/clima').expect(401);
    await http
      .get('/api/v1/contingencias/clima')
      .set('Authorization', `Bearer ${ctx.token(Rol.CHOFER)}`)
      .expect(403);
    await http
      .post('/api/v1/contingencias/clima/simulador')
      .send({ tipo: INICIO, payload: start() })
      .expect(401);
    await http
      .get('/api/v1/auth/sesion')
      .set(admin)
      .expect(200)
      .expect(({ body }: { body: { rol: string } }) => expect(body.rol).toBe('ADMINISTRADOR'));
  });
  it('acepta un alertaId textual del contrato EDA sin convertirlo a UUID ni minusculas', async () => {
    const p = { ...start(), alertaId: 'Alerta-ESP-2026-ABC' };
    const z = await zone();
    await receive(INICIO, p).expect(201);
    const decision = (await resolve(p.alertaId, [z.id]).expect(200)).body;
    expect(decision.alertaId).toBe(p.alertaId);
    await receive(FIN, end(p.alertaId)).expect(201);
    expect(
      (await http.get(`/api/v1/contingencias/${decision.contingenciaId}`).set(admin)).body.alertaId,
    ).toBe(p.alertaId);
  });
});
