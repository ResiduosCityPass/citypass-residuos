import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { Type } from 'avsc';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';
import { EstadoParada, EstadoRuta } from '../src/shared/domain/enums';
import { Ruta } from '../src/modules/rutas/domain/ruta.entity';
import { Parada } from '../src/modules/rutas/domain/parada.entity';
import {
  CRITICIDAD_CONFIRMADA as INICIO,
  CRITICIDAD_FINALIZADA as FIN,
} from '../src/modules/contingencias/application/dto/criticidad-climatica.dto';
import { EventTypes, DomainEvent } from '../src/shared/domain/domain-event';
import { traducirAGateway } from '../src/shared/events/gateway/traductor-gateway';

describe('Métrica de cuadrillas afectadas por clima (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: { Authorization: string };
  let next: number;
  const idAlerta = () => `Alerta-ESP-${randomUUID()}`;
  const receive = (tipo: string, alertaId: string) =>
    http
      .post('/api/v1/contingencias/clima/simulador')
      .set(admin)
      .send({
        tipo,
        payload:
          tipo === INICIO
            ? {
                alertaId,
                nivelCriticidad: 'ALTA',
                fenomeno: 'VIENTO_FUERTE',
                ubicaciones: [{ latitud: -34.6037, longitud: -58.3816 }],
                vigenciaDesde: Date.now() - 60000,
                vigenciaHasta: Date.now() + 3600000,
                actorSub: 'delegado-esp',
              }
            : { alertaId, finalizadaEn: Date.now(), actorSub: 'delegado-esp' },
      });
  const decidir = (alertaId: string, zonaIds: string[]) =>
    http
      .patch(`/api/v1/contingencias/clima/${alertaId}/resolver`)
      .set(admin)
      .send({ accion: 'SUSPENDER', motivo: 'Ráfagas verificadas por el operador', zonaIds });
  const metricas = () =>
    ctx.dataSource.query<Array<{ sobre: DomainEvent; estado: string }>>(
      "SELECT sobre, estado FROM evento_pendiente WHERE \"eventType\" = $1 ORDER BY sobre->'payload'->>'intervencionId'",
      [EventTypes.INTERVENCION_ACTUALIZADA],
    );
  const zona = async (nombre: string) =>
    (
      await http
        .post('/api/v1/zonas')
        .set(admin)
        .send({ nombre, umbralCriticoPct: 70, umbralTemperaturaC: 60 })
        .expect(201)
    ).body.id as string;
  const parada = async (
    zonaId: string,
    estadoRuta = EstadoRuta.ASIGNADA,
    estadoParada = EstadoParada.PENDIENTE,
    reutilizar?: Ruta,
  ) => {
    const n = ++next;
    let ruta = reutilizar;
    if (!ruta) {
      const camion = (
        await http
          .post('/api/v1/camiones')
          .set(admin)
          .send({
            patente: `AA${100 + n}BB`,
            capacidadLitros: 10000,
            tipoResiduoHabilitado: 'COMUN',
          })
          .expect(201)
      ).body;
      const chofer = (
        await http
          .post('/api/v1/choferes')
          .set(admin)
          .send({ nombre: `Chofer ${n}`, legajo: `MET-${n}` })
          .expect(201)
      ).body;
      ruta = await ctx.dataSource.getRepository(Ruta).save({
        camionId: camion.id,
        choferId: chofer.id,
        estado: estadoRuta,
        distanciaEstimadaKm: 1,
        litrosEstimados: 900,
        asignadaEn: estadoRuta === EstadoRuta.PROPUESTA ? null : new Date(),
      });
    }
    const contenedor = (
      await http
        .post('/api/v1/contenedores')
        .set(admin)
        .send({ zonaId, tipoResiduo: 'COMUN', capacidadLitros: 1100, lat: -34.6037, lng: -58.3816 })
        .expect(201)
    ).body;
    await ctx.dataSource.query(
      'UPDATE contenedor SET "nivelLlenadoPct" = 90, estado = $2 WHERE id = $1',
      [contenedor.id, 'CRITICO'],
    );
    const p = await ctx.dataSource
      .getRepository(Parada)
      .save({ rutaId: ruta.id, contenedorId: contenedor.id, orden: n, estado: estadoParada });
    return { parada: p, ruta, contenedor };
  };
  const snapshot = async () => ({
    paradas: await ctx.dataSource.query(
      'SELECT id, estado, "rutaId", "contenedorId" FROM parada ORDER BY id',
    ),
    rutas: await ctx.dataSource.query(
      'SELECT id, estado, "camionId", "choferId" FROM ruta ORDER BY id',
    ),
    contenedores: await ctx.dataSource.query(
      'SELECT id, "nivelLlenadoPct", estado FROM contenedor ORDER BY id',
    ),
  });
  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = { Authorization: `Bearer ${ctx.token()}` };
  });
  beforeEach(async () => {
    await ctx.limpiar();
    next = 0;
  });
  afterAll(async () => {
    await ctx?.cerrar();
  });

  it('publica solo al decidir, excluye propuestas y paradas resueltas y conserva la operación', async () => {
    const centro = await zona('Centro');
    const norte = await zona('Norte');
    const a = await parada(centro);
    const b = await parada(centro, EstadoRuta.ASIGNADA, EstadoParada.PENDIENTE, a.ruta);
    const c = await parada(centro, EstadoRuta.EN_CURSO);
    await parada(norte, EstadoRuta.ASIGNADA, EstadoParada.PENDIENTE, a.ruta);
    await parada(centro, EstadoRuta.PROPUESTA);
    await parada(centro, EstadoRuta.CANCELADA);
    await parada(centro, EstadoRuta.COMPLETADA);
    await parada(centro, EstadoRuta.ASIGNADA, EstadoParada.CONFIRMADA, a.ruta);
    await parada(centro, EstadoRuta.ASIGNADA, EstadoParada.OMITIDA, a.ruta);
    const before = await snapshot();
    const alertaId = idAlerta();
    await receive(INICIO, alertaId).expect(201);
    expect(await metricas()).toHaveLength(0);
    await decidir(alertaId, [centro]).expect(200);
    const outbox = await metricas();
    expect(outbox).toHaveLength(3);
    expect(new Set(outbox.map((e) => e.sobre.payload.intervencionId))).toEqual(
      new Set([a.parada.id, b.parada.id, c.parada.id]),
    );
    expect(new Set(outbox.map((e) => e.sobre.payload.camionId)).size).toBe(2);
    const schema = Type.forSchema(
      JSON.parse(
        readFileSync(
          resolvePath(__dirname, '../../docs/arquitectura/schemas/IntervencionActualizada.avsc'),
          'utf8',
        ),
      ),
    );
    for (const e of outbox) {
      expect(e.estado).toBe('PENDIENTE');
      expect(e.sobre.correlationId).toBe(alertaId);
      expect(e.sobre.payload).toMatchObject({
        estadoAnterior: 'PROGRAMADA',
        estadoNuevo: 'AFECTADA',
        causaId: alertaId,
        causaTipo: 'EVENTO_CLIMATICO',
      });
      const wire = traducirAGateway(e.sobre)!;
      expect(wire.tipo).toBe('IntervencionActualizada');
      expect(schema.isValid(wire.datos)).toBe(true);
      expect(schema.fromBuffer(schema.toBuffer(wire.datos))).toMatchObject({
        causaId: alertaId,
        causaTipo: 'EVENTO_CLIMATICO',
      });
    }
    expect(outbox.map((e) => e.sobre.payload.camionId)).toEqual(
      expect.arrayContaining(['AA101BB', 'AA103BB']),
    );
    expect(await snapshot()).toEqual(before);
    const ruta = (await http.get(`/api/v1/rutas/${a.ruta.id}`).set(admin).expect(200)).body;
    expect(ruta.paradasSuspendidas).toBe(2);
    await decidir(alertaId, [centro]).expect(409);
    await receive(FIN, alertaId).expect(201);
    expect(await metricas()).toEqual(outbox);
  });

  it('alertas superpuestas separan sus causas y una reentrega no publica otra métrica', async () => {
    const centro = await zona('Centro');
    await parada(centro);
    const a = idAlerta();
    const b = idAlerta();
    // La reentrega es exactamente el mismo payload, como lo entrega EDA.
    const body = {
      alertaId: a,
      nivelCriticidad: 'ALTA',
      fenomeno: 'VIENTO_FUERTE',
      ubicaciones: [{ latitud: -34.6037, longitud: -58.3816 }],
      vigenciaDesde: Date.now() - 60000,
      vigenciaHasta: Date.now() + 3600000,
      actorSub: 'delegado-esp',
    };
    const deliver = () =>
      http
        .post('/api/v1/contingencias/clima/simulador')
        .set(admin)
        .send({ tipo: INICIO, payload: body });
    await deliver().expect(201);
    await decidir(a, [centro]).expect(200);
    await deliver().expect(201);
    await receive(INICIO, b).expect(201);
    await decidir(b, [centro]).expect(200);
    expect((await metricas()).map((e) => e.sobre.payload.causaId).sort()).toEqual([a, b].sort());
  });

  it('conserva el cierre anticipado y no emite nada al decidir sin afectación', async () => {
    const centro = await zona('Centro');
    await parada(centro);
    const sin = idAlerta();
    await receive(INICIO, sin).expect(201);
    await http
      .patch(`/api/v1/contingencias/clima/${sin}/resolver`)
      .set(admin)
      .send({ accion: 'SIN_AFECTACION', motivo: 'No afecta nuestras rutas de recolección' })
      .expect(200);
    expect(await metricas()).toHaveLength(0);
    const alertaId = idAlerta();
    await receive(FIN, alertaId).expect(201);
    await receive(INICIO, alertaId).expect(201);
    const res = (await decidir(alertaId, [centro]).expect(200)).body;
    expect(await metricas()).toHaveLength(1);
    expect(
      (await http.get(`/api/v1/contingencias/${res.contingenciaId}`).set(admin).expect(200)).body
        .estado,
    ).toBe('PENDIENTE_RECUPERACION');
    await http
      .patch(`/api/v1/contingencias/${res.contingenciaId}/recuperar`)
      .set(admin)
      .expect(200);
    expect(await metricas()).toHaveLength(1);
  });

  it('revierte suspensión, inbox y métricas si falla el outbox; el reintento publica una sola vez', async () => {
    const centro = await zona('Centro');
    await parada(centro);
    const alertaId = idAlerta();
    await receive(INICIO, alertaId).expect(201);
    const before = await snapshot();
    await ctx.dataSource.query(
      `CREATE FUNCTION qa_fallar_metrica_clima() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'residuos.intervencion.actualizada' THEN RAISE EXCEPTION 'qa fallo metrica'; END IF; RETURN NEW; END; $$`,
    );
    await ctx.dataSource.query(
      'CREATE TRIGGER qa_metrica_clima BEFORE INSERT ON evento_pendiente FOR EACH ROW EXECUTE FUNCTION qa_fallar_metrica_clima()',
    );
    try {
      await decidir(alertaId, [centro]).expect(500);
      expect(await ctx.dataSource.query('SELECT * FROM contingencia')).toHaveLength(0);
      expect(await ctx.dataSource.query('SELECT * FROM evento_climatico_recibido')).toHaveLength(0);
      expect(await ctx.dataSource.query('SELECT * FROM evento_pendiente')).toHaveLength(0);
      expect(await snapshot()).toEqual(before);
      expect(
        (await http.get('/api/v1/contingencias/clima').set(admin).expect(200)).body.alertas[0]
          .decision,
      ).toBe('PENDIENTE_REVISION');
    } finally {
      await ctx.dataSource.query('DROP TRIGGER qa_metrica_clima ON evento_pendiente');
      await ctx.dataSource.query('DROP FUNCTION qa_fallar_metrica_clima()');
    }
    await decidir(alertaId, [centro]).expect(200);
    expect(await metricas()).toHaveLength(1);
  });
});
