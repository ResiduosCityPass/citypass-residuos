import * as request from 'supertest';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Type, Schema } from 'avsc';
import { ConfigService } from '@nestjs/config';
import { crearAppDePrueba, AppDePrueba } from './helpers/app-de-prueba';
import { EdaTokenService } from '../src/shared/events/eda/eda-token.service';
import { CONTRATOS_EDA, registroEda } from '../src/shared/events/eda/eda-contracts';
import { RecepcionEdaService } from '../src/modules/contingencias/application/recepcion-eda.service';
import { DespachadorOutbox } from '../src/shared/events/outbox/despachador-outbox';
import {
  CRITICIDAD_CONFIRMADA as START,
  CRITICIDAD_FINALIZADA as END,
} from '../src/modules/contingencias/application/dto/criticidad-climatica.dto';
import {
  crearInicioSimulacro,
  crearFinSimulacro,
  SIMULACRO_CONFIRMADO,
  SIMULACRO_FINALIZADO,
} from '../src/modules/contingencias/application/simulacro-eda';

describe('Recepcion EDA y outbox HTTP con schemas Avro (e2e)', () => {
  let ctx: AppDePrueba;
  let gateway: Server;
  let received: Array<{ path: string; data: Record<string, unknown> }>;
  let fail = false;
  const keys = ['EVENT_BUS_DRIVER', 'EDA_GATEWAY_URL', 'EDA_CLIENT_SECRET', 'EDA_CONSUMER_ENABLED'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const start = (alertaId: string) => ({
    alertaId,
    nivelCriticidad: 'ALTA',
    fenomeno: 'TORMENTA_FUERTE',
    barrios: ['CENTRO'],
    ubicaciones: [{ latitud: -34.6, longitud: -58.38 }],
    vigenciaDesde: 1793311620000,
    vigenciaHasta: 1793333220000,
    actorSub: 'espacios-actor',
  });
  const envelope = (tipo: string, data: unknown) => ({
    data,
    metadata: {
      eventId: randomUUID(),
      eventType: tipo,
      schemaId: 28,
      receivedAt: Date.now(),
      payloadHash: 'a'.repeat(64),
      source: 'espacios-service',
    },
  });
  const receive = (tipo: string, data: unknown) =>
    ctx.app.get(RecepcionEdaService).procesar(tipo, tipo, 28, envelope(tipo, data));
  const api = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token()}` });
  const setup = async () => {
    const zone = (
      await api()
        .post('/api/v1/zonas')
        .set(auth())
        .send({ nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
        .expect(201)
    ).body;
    const p = start(randomUUID());
    await receive(START, p);
    const linked = (
      await api()
        .patch(`/api/v1/contingencias/clima/${p.alertaId}/resolver`)
        .set(auth())
        .send({
          accion: 'SUSPENDER',
          motivo: 'Inundacion verificada por el operador',
          zonaIds: [zone.id],
        })
        .expect(200)
    ).body;
    return { p, linked };
  };
  beforeAll(async () => {
    gateway = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      const data = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
      received.push({ path: req.url!, data });
      const name = decodeURIComponent(req.url!.split('/')[4]).split('.').at(-1);
      const contract = Object.values(CONTRATOS_EDA).find((c) => c.name === name)!;
      const schema = registroEda(contract);
      const avro = Type.forSchema({ type: 'record', ...schema } as Schema);
      if (req.headers.authorization !== 'Bearer test-service-token' || !avro.isValid(data)) {
        res.writeHead(400).end();
        return;
      }
      res.writeHead(fail ? 503 : 202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data, metadata: { eventId: randomUUID() } }));
    });
    await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
    process.env.EVENT_BUS_DRIVER = 'platform';
    process.env.EDA_CLIENT_SECRET = 'test-only';
    process.env.EDA_CONSUMER_ENABLED = 'false';
    process.env.EDA_GATEWAY_URL = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/api/v1`;
    ctx = await crearAppDePrueba((builder) => {
      builder.overrideProvider(ConfigService).useValue(new ConfigService({ ...process.env }));
      builder
        .overrideProvider(EdaTokenService)
        .useValue({ obtener: async () => 'test-service-token' });
    });
  });
  beforeEach(async () => {
    received = [];
    fail = false;
    await ctx.limpiar();
    ctx.app.get(ConfigService).set('EDA_CLIMA_SIMULACRO_ENABLED', 'false');
  });
  afterAll(async () => {
    await ctx?.cerrar();
    await new Promise<void>((resolve) => gateway?.close(() => resolve()));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it('conecta las cuatro respuestas climaticas con el alertaId del productor', async () => {
    const { p, linked } = await setup();
    await receive(END, {
      alertaId: p.alertaId,
      finalizadaEn: 1793333220000,
      actorSub: 'espacios-actor',
    });
    await api()
      .patch(`/api/v1/contingencias/${linked.contingenciaId}/recuperar`)
      .set(auth())
      .expect(200);
    expect(await ctx.app.get(DespachadorOutbox).despachar()).toBe(4);
    expect(received.map((r) => r.path.split('/').at(-2)).sort()).toEqual(
      [
        'com.citypass.residuos.ServicioAfectado',
        'com.citypass.residuos.RecuperacionPendiente',
        'com.citypass.residuos.RecuperacionHabilitada',
        'com.citypass.residuos.ServicioRestablecido',
      ].sort(),
    );
    expect(
      received.every((r) => r.data.alertaId === p.alertaId && r.data.correlationId === p.alertaId),
    ).toBe(true);
    expect(received.find((r) => r.path.includes('.ServicioAfectado/'))!.data.actorSub).toBe(
      'test-ADMINISTRADOR',
    );
    expect(received.find((r) => r.path.includes('.RecuperacionPendiente/'))!.data.actorSub).toBe(
      'espacios-actor',
    );
    expect(await ctx.dataSource.query('SELECT * FROM entrega_eda')).toHaveLength(2);
  });
  it('procesa los dos tipos propios por el inbox y publica las cuatro respuestas con identidad de simulacro', async () => {
    ctx.app.get(ConfigService).set('EDA_CLIMA_SIMULACRO_ENABLED', 'true');
    const payload = crearInicioSimulacro();
    const inbound = envelope(SIMULACRO_CONFIRMADO, payload);
    inbound.metadata.source = 'grupo6';
    const receiver = ctx.app.get(RecepcionEdaService);
    await receiver.procesar(START, SIMULACRO_CONFIRMADO, 28, inbound);
    const zone = (
      await api()
        .post('/api/v1/zonas')
        .set(auth())
        .send({ nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
        .expect(201)
    ).body;
    const linked = (
      await api()
        .patch(`/api/v1/contingencias/clima/${payload.alertaId}/resolver`)
        .set(auth())
        .send({
          accion: 'SUSPENDER',
          motivo: 'SIMULACRO de inundacion verificado',
          zonaIds: [zone.id],
        })
        .expect(200)
    ).body;
    expect(linked.origen).toBe('eda-simulacro');
    const ending = envelope(SIMULACRO_FINALIZADO, crearFinSimulacro(payload.alertaId));
    ending.metadata.source = 'grupo6';
    await receiver.procesar(END, SIMULACRO_FINALIZADO, 28, ending);
    await api()
      .patch(`/api/v1/contingencias/${linked.contingenciaId}/recuperar`)
      .set(auth())
      .expect(200);
    expect(await ctx.app.get(DespachadorOutbox).despachar()).toBe(4);
    expect(
      received.every(
        (r) => r.data.alertaId === payload.alertaId && r.data.correlationId === payload.alertaId,
      ),
    ).toBe(true);
    expect(
      (await ctx.dataSource.query('SELECT * FROM entrega_eda'))
        .map((e: { metadata: { eventType: string } }) => e.metadata.eventType)
        .sort(),
    ).toEqual([SIMULACRO_CONFIRMADO, SIMULACRO_FINALIZADO].sort());
    const flood = (
      await api().get(`/api/v1/contingencias/${linked.contingenciaId}`).set(auth()).expect(200)
    ).body;
    expect(flood.descripcion).toMatch(/^SIMULACRO/);
    expect(flood.estado).toBe('RECUPERADA');
  });
  it('no aplica un simulacro recibido si el entorno no lo habilita', async () => {
    const inbound = envelope(SIMULACRO_CONFIRMADO, crearInicioSimulacro());
    inbound.metadata.source = 'grupo6';
    await expect(
      ctx.app.get(RecepcionEdaService).procesar(START, SIMULACRO_CONFIRMADO, 28, inbound),
    ).rejects.toThrow('Simulacro EDA');
    expect(await ctx.dataSource.query('SELECT * FROM entrega_eda')).toHaveLength(0);
    expect(await ctx.dataSource.query('SELECT * FROM alerta_climatica_externa')).toHaveLength(0);
  });
  it('mantiene el evento pendiente y su ID de negocio estable si el gateway falla', async () => {
    await setup();
    fail = true;
    expect(await ctx.app.get(DespachadorOutbox).despachar()).toBe(0);
    const row = (await ctx.dataSource.query('SELECT * FROM evento_pendiente'))[0];
    expect(row.estado).toBe('PENDIENTE');
    expect(row.intentos).toBe(1);
    fail = false;
    await ctx.dataSource.query('UPDATE evento_pendiente SET "proximoIntentoEn" = $1', [
      new Date(Date.now() - 1000),
    ]);
    expect(await ctx.app.get(DespachadorOutbox).despachar()).toBe(1);
    expect(received[0].data).toEqual(received[1].data);
  });
  it('deduplica la alerta publicada por Espacios al reentregarse con los defaults del nuevo schema', async () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, 'fixtures/espacios-publicos-clima.json'), 'utf8'),
    ) as { publishedStart: Record<string, unknown> };
    const receiver = ctx.app.get(RecepcionEdaService);
    const old = envelope(START, fixture.publishedStart);
    old.metadata.schemaId = 26;
    old.metadata.source = 'grupo7';
    await receiver.procesar(START, START, 26, old);
    const updated = envelope(START, { ...fixture.publishedStart, barrios: [] });
    updated.metadata.source = 'grupo7';
    expect(await receiver.procesar(START, START, 28, updated)).toEqual({ duplicado: true });
    expect(await ctx.dataSource.query('SELECT * FROM entrega_eda')).toHaveLength(2);
    const alerts = await ctx.dataSource.query('SELECT * FROM alerta_climatica_externa');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].decision).toBe('PENDIENTE_REVISION');
    expect(alerts[0].contingenciaId).toBeNull();
    expect(await ctx.dataSource.query('SELECT * FROM evento_pendiente')).toHaveLength(0);
  });
  it('revierte fin e inbox juntos si falla el registro de la entrega; reintentar funciona', async () => {
    const { p, linked } = await setup();
    await ctx.dataSource.query(
      `CREATE FUNCTION qa_inbox_error() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'qa inbox rollback'; END; $$`,
    );
    await ctx.dataSource.query(
      'CREATE TRIGGER qa_inbox BEFORE INSERT ON entrega_eda FOR EACH ROW EXECUTE FUNCTION qa_inbox_error()',
    );
    const ending = envelope(END, {
      alertaId: p.alertaId,
      finalizadaEn: 1793333220000,
      actorSub: 'espacios-actor',
    });
    try {
      await expect(ctx.app.get(RecepcionEdaService).procesar(END, END, 28, ending)).rejects.toThrow(
        'qa inbox rollback',
      );
      expect(
        (await api().get(`/api/v1/contingencias/${linked.contingenciaId}`).set(auth())).body.estado,
      ).toBe('ACTIVA');
      expect(await ctx.dataSource.query('SELECT * FROM evento_pendiente')).toHaveLength(1);
      expect(await ctx.dataSource.query('SELECT * FROM entrega_eda')).toHaveLength(1);
    } finally {
      await ctx.dataSource.query('DROP TRIGGER qa_inbox ON entrega_eda');
      await ctx.dataSource.query('DROP FUNCTION qa_inbox_error()');
    }
    await ctx.app.get(RecepcionEdaService).procesar(END, END, 28, ending);
    await ctx.app.get(RecepcionEdaService).procesar(END, END, 28, ending);
    expect(await ctx.dataSource.query('SELECT * FROM entrega_eda')).toHaveLength(2);
    expect(await ctx.dataSource.query('SELECT * FROM evento_pendiente')).toHaveLength(2);
  });
});
