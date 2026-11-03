import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { Kafka } from 'kafkajs';
import { EstadoRecepcionBus } from '../../shared/events/estado-recepcion-bus';
import { GatewayTransporte } from '../../shared/events/gateway/gateway.transporte';
import { SIMULACROS_EDA } from '../contingencias/application/simulacro-eda';
import { CRITICIDAD_CONFIRMADA as START } from '../contingencias/application/dto/criticidad-climatica.dto';
import { IntegracionService } from './application/integracion.service';
import { CitypassKafkaConsumer } from './citypass-kafka.consumer';

jest.mock('kafkajs', () => ({ Kafka: jest.fn(), logLevel: { WARN: 1 } }));
const conectado = () => new Promise((resolve) => setImmediate(resolve));
describe('Consumidor unificado: clima y otros modulos', () => {
  const consumer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    run: jest.fn(),
    commitOffsets: jest.fn(),
    on: jest.fn(),
    events: { CRASH: 'crash', GROUP_JOIN: 'join' },
  };
  const gateway = { obtenerToken: jest.fn(), listarTipos: jest.fn() };
  const integracion = { procesar: jest.fn() };
  const frame = Buffer.from([0, 0, 0, 0, 28, 1]);
  let estado: EstadoRecepcionBus;
  let service: CitypassKafkaConsumer;
  let config: ConfigService;
  const message = (topic = START) => ({
    topic,
    partition: 0,
    message: { value: frame, offset: '9007199254740993' },
  });
  const iniciar = async () => {
    await service.onApplicationBootstrap();
    await conectado();
    return consumer.run.mock.calls[0][0].eachMessage;
  };
  beforeEach(() => {
    jest.resetAllMocks();
    (Kafka as jest.Mock).mockImplementation(() => ({ consumer: () => consumer }));
    jest.spyOn(SchemaRegistry.prototype, 'getSchema').mockResolvedValue({} as never);
    jest
      .spyOn(SchemaRegistry.prototype, 'decode')
      .mockResolvedValue({ metadata: { eventType: START }, data: {} });
    consumer.disconnect.mockResolvedValue(undefined);
    gateway.obtenerToken.mockResolvedValue('shared-token');
    gateway.listarTipos.mockResolvedValue(
      SIMULACROS_EDA.map((s) => ({ fqn: s.fqn, topic: s.fqn + '.v2' })),
    );
    config = new ConfigService({ NODE_ENV: 'test', KAFKA_BROKERS: 'broker:9092' });
    estado = new EstadoRecepcionBus();
    service = new CitypassKafkaConsumer(
      integracion as unknown as IntegracionService,
      gateway as unknown as GatewayTransporte,
      config,
      estado,
    );
  });
  afterEach(async () => {
    await service.onApplicationShutdown();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('usa un solo consumidor, token compartido, TLS y no reproduce emergencias antiguas', async () => {
    await iniciar();
    expect(Kafka).toHaveBeenCalledTimes(1);
    const options = (Kafka as jest.Mock).mock.calls[0][0];
    expect(options.ssl).toBe(true);
    expect(await options.sasl.oauthBearerProvider()).toEqual({ value: 'shared-token' });
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topics: [expect.any(RegExp)],
      fromBeginning: false,
    });
    expect(consumer.run.mock.calls[0][0].autoCommit).toBe(false);
    expect(gateway.listarTipos).not.toHaveBeenCalled();
  });
  it('confirma offset+1 exacto despues de completar el negocio para ambos modulos', async () => {
    const handler = await iniciar();
    let finish!: () => void;
    integracion.procesar.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = handler(message());
    await conectado();
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(integracion.procesar).toHaveBeenCalledWith(expect.any(Object), {
      topic: START,
      schemaId: 28,
    });
    expect(consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: START, partition: 0, offset: '9007199254740994' },
    ]);
    await handler(message('com.citypass.emergencias.EmergenciaCreada'));
    expect(integracion.procesar).toHaveBeenLastCalledWith(expect.any(Object), {
      topic: 'com.citypass.emergencias.EmergenciaCreada',
      schemaId: 28,
    });
    expect(estado.estado().estado).toBe('CONECTADO');
  });
  it('no confirma si falla la base o el commit, y refleja la entrega pendiente', async () => {
    const handler = await iniciar();
    integracion.procesar.mockRejectedValueOnce(new Error('base caida'));
    await expect(handler(message())).rejects.toThrow('base caida');
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
    expect(estado.estado().estado).toBe('ERROR');
    consumer.commitOffsets.mockRejectedValueOnce(new Error('coordinador caido'));
    await expect(handler(message())).rejects.toThrow('coordinador caido');
  });
  it('descarta un contrato invalido sin dejarlo trabando la particion', async () => {
    const handler = await iniciar();
    integracion.procesar.mockRejectedValueOnce(new BadRequestException('contrato invalido'));
    await handler(message());
    expect(consumer.commitOffsets).toHaveBeenCalledTimes(1);
  });
  it('agrega solo los dos tipos de simulacro registrados mediante opt-in', async () => {
    config.set('CLIMA_SIMULACRO_EDA_HABILITADO', 'true');
    await iniciar();
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topics: [expect.any(RegExp), ...SIMULACROS_EDA.map((s) => s.fqn + '.v2')],
      fromBeginning: false,
    });
    expect(estado.estado().simulacroHabilitado).toBe(true);
  });
  it('la falta de tipos opcionales no impide consumir el bus real', async () => {
    config.set('CLIMA_SIMULACRO_EDA_HABILITADO', 'true');
    gateway.listarTipos.mockResolvedValue([]);
    await iniciar();
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topics: [expect.any(RegExp)],
      fromBeginning: false,
    });
    expect(estado.estado().simulacrosPendientesRegistro).toHaveLength(2);
  });
  it('no habilita simulacros en produccion aunque se omita el validador', async () => {
    config.set('CLIMA_SIMULACRO_EDA_HABILITADO', 'true');
    config.set('NODE_ENV', 'production');
    await iniciar();
    expect(gateway.listarTipos).not.toHaveBeenCalled();
    expect(estado.estado().simulacroHabilitado).toBe(false);
  });
  it('refleja caidas y reingreso del grupo', async () => {
    await iniciar();
    consumer.on.mock.calls.find(([event]) => event === 'crash')![1]();
    expect(estado.estado().estado).toBe('ERROR');
    consumer.on.mock.calls.find(([event]) => event === 'join')![1]();
    expect(estado.estado().estado).toBe('CONECTADO');
  });
  it('reintenta la conexion inicial sin frenar la API y cancela al cerrar', async () => {
    jest.useFakeTimers();
    consumer.connect.mockRejectedValueOnce(new Error('offline'));
    await service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(estado.estado().estado).toBe('ERROR');
    await jest.advanceTimersByTimeAsync(30000);
    expect(consumer.connect).toHaveBeenCalledTimes(2);
    await service.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(30000);
    expect(consumer.connect).toHaveBeenCalledTimes(2);
  });
});
