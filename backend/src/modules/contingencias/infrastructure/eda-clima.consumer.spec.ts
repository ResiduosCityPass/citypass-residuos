import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { EdaClimaConsumer } from './eda-clima.consumer';
import { EdaTokenService } from '../../../shared/events/eda/eda-token.service';
import { EdaGatewayClient } from '../../../shared/events/eda/eda-gateway.client';
import { RecepcionEdaService } from '../application/recepcion-eda.service';
import {
  CRITICIDAD_CONFIRMADA as START,
  CRITICIDAD_FINALIZADA as END,
} from '../application/dto/criticidad-climatica.dto';
import {
  SIMULACROS_EDA,
  SIMULACRO_CONFIRMADO,
  SIMULACRO_FINALIZADO,
} from '../application/simulacro-eda';
jest.mock('kafkajs', () => ({ Kafka: jest.fn(), logLevel: { NOTHING: 0 } }));
jest.mock('@kafkajs/confluent-schema-registry', () => ({ SchemaRegistry: jest.fn() }));

describe('Consumidor Kafka EDA', () => {
  let service: EdaClimaConsumer;
  const consumer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    run: jest.fn(),
    commitOffsets: jest.fn(),
    on: jest.fn(),
    events: { CRASH: 'crash', GROUP_JOIN: 'join' },
  };
  const gateway = { listarTipos: jest.fn() };
  const tokens = { obtener: jest.fn() };
  const receiver = { procesar: jest.fn() };
  const decode = jest.fn();
  const frame = Buffer.from([0, 0, 0, 0, 28, 0]);
  let settings: Record<string, string>;
  const message = (value: Buffer | null = frame) => ({
    topic: START,
    partition: 0,
    message: { value, offset: '9007199254740993' },
  });
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    (Kafka as jest.Mock).mockImplementation(() => ({ consumer: () => consumer }));
    (SchemaRegistry as jest.Mock).mockImplementation(() => ({ decode }));
    consumer.disconnect.mockResolvedValue(undefined);
    gateway.listarTipos.mockResolvedValue([
      { fqn: START, topic: START },
      { fqn: END, topic: END },
    ]);
    tokens.obtener.mockResolvedValue('verified-service-token');
    receiver.procesar.mockResolvedValue({});
    decode.mockResolvedValue({ data: 'decoded' });
    settings = {
      EDA_KAFKA_BROKERS: 'broker.example:9092',
      EDA_GATEWAY_URL: 'https://gateway.example/api/v1',
    };
    service = new EdaClimaConsumer(
      new ConfigService(settings),
      tokens as unknown as EdaTokenService,
      gateway as unknown as EdaGatewayClient,
      receiver as unknown as RecepcionEdaService,
    );
  });
  afterEach(async () => {
    await service.onApplicationShutdown();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('queda inactivo si no se habilita expresamente', () => {
    service.onApplicationBootstrap();
    expect(Kafka).not.toHaveBeenCalled();
    expect(service.estado().estado).toBe('DESHABILITADO');
  });
  it('usa TLS, OAuth, topicos registrados y deshabilita el commit automatico', async () => {
    await service.iniciar();
    const config = (Kafka as jest.Mock).mock.calls[0][0];
    expect(config.ssl).toBe(true);
    expect(await config.sasl.oauthBearerProvider()).toEqual({ value: 'verified-service-token' });
    expect(consumer.subscribe).toHaveBeenCalledWith({ topics: [START, END], fromBeginning: true });
    expect(consumer.run.mock.calls[0][0].autoCommit).toBe(false);
  });
  it('confirma offset +1 exacto solamente al terminar la transaccion', async () => {
    await service.iniciar();
    let finish!: () => void;
    receiver.procesar.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const handler = consumer.run.mock.calls[0][0].eachMessage;
    const pending = handler(message());
    await Promise.resolve();
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(receiver.procesar).toHaveBeenCalledWith(START, START, 28, { data: 'decoded' });
    expect(consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: START, partition: 0, offset: '9007199254740994' },
    ]);
    expect(service.estado()).toMatchObject({ estado: 'CONECTADO', ultimoError: null });
  });
  it('no confirma cuando falla Avro, el guardado o el commit', async () => {
    await service.iniciar();
    const handler = consumer.run.mock.calls[0][0].eachMessage;
    decode.mockRejectedValueOnce(new Error('schema invalido'));
    await expect(handler(message())).rejects.toThrow('schema invalido');
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
    receiver.procesar.mockRejectedValueOnce(new Error('base caida'));
    await expect(handler(message())).rejects.toThrow('base caida');
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
    expect(service.estado().estado).toBe('ERROR');
    consumer.commitOffsets.mockRejectedValueOnce(new Error('coordinador caido'));
    await expect(handler(message())).rejects.toThrow('coordinador caido');
  });
  it.each([null, Buffer.from([0]), Buffer.from([1, 0, 0, 0, 1])])(
    'no confirma mensajes sin framing Avro',
    async (value) => {
      await service.iniciar();
      await expect(consumer.run.mock.calls[0][0].eachMessage(message(value))).rejects.toThrow(
        'Confluent',
      );
      expect(decode).not.toHaveBeenCalled();
      expect(consumer.commitOffsets).not.toHaveBeenCalled();
    },
  );
  it('resuelve el topico de la version vigente y refleja reinicios', async () => {
    gateway.listarTipos.mockResolvedValue([
      { fqn: START, topic: START + '.v2' },
      { fqn: END, topic: END },
    ]);
    await service.iniciar();
    expect(service.estado().topicos).toContain(START + '.v2');
    consumer.on.mock.calls.find(([event]) => event === 'crash')![1]();
    expect(service.estado().estado).toBe('ERROR');
    consumer.on.mock.calls.find(([event]) => event === 'join')![1]();
    expect(service.estado().estado).toBe('CONECTADO');
  });
  it('suscribe los tipos propios solo con opt-in y los adapta a la misma recepcion', async () => {
    settings.EDA_CLIMA_SIMULACRO_ENABLED = 'true';
    gateway.listarTipos.mockResolvedValue([
      { fqn: START, topic: START },
      { fqn: END, topic: END },
      ...SIMULACROS_EDA.map((s) => ({ fqn: s.fqn, topic: s.fqn })),
    ]);
    await service.iniciar();
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topics: [START, END, SIMULACRO_CONFIRMADO, SIMULACRO_FINALIZADO],
      fromBeginning: true,
    });
    const handler = consumer.run.mock.calls[0][0].eachMessage;
    await handler({ ...message(), topic: SIMULACRO_CONFIRMADO });
    expect(receiver.procesar).toHaveBeenCalledWith(START, SIMULACRO_CONFIRMADO, 28, {
      data: 'decoded',
    });
    await handler({ ...message(), topic: SIMULACRO_FINALIZADO });
    expect(receiver.procesar).toHaveBeenLastCalledWith(END, SIMULACRO_FINALIZADO, 28, {
      data: 'decoded',
    });
    expect(service.estado().simulacroHabilitado).toBe(true);
  });
  it('ignora los tipos de simulacro en produccion aun si se omite la validacion de entorno', async () => {
    settings.EDA_CLIMA_SIMULACRO_ENABLED = 'true';
    settings.NODE_ENV = 'production';
    await service.iniciar();
    expect(consumer.subscribe).toHaveBeenCalledWith({ topics: [START, END], fromBeginning: true });
    expect(service.estado().simulacroHabilitado).toBe(false);
  });
  it.each([{ available: [] }, { available: [SIMULACROS_EDA[0]] }])(
    'mantiene la recepcion real aunque falten tipos opcionales de simulacro: %j',
    async ({ available }) => {
      settings.EDA_CLIMA_SIMULACRO_ENABLED = 'true';
      gateway.listarTipos.mockResolvedValue([
        { fqn: START, topic: START },
        { fqn: END, topic: END },
        ...available.map((s) => ({ fqn: s.fqn, topic: s.fqn })),
      ]);
      await service.iniciar();
      expect(consumer.subscribe).toHaveBeenCalledWith({
        topics: [START, END],
        fromBeginning: true,
      });
      expect(service.estado().estado).toBe('CONECTADO');
      expect(service.estado().simulacrosPendientesRegistro).toContain(SIMULACRO_FINALIZADO);
      const handler = consumer.run.mock.calls[0][0].eachMessage;
      await handler(message());
      expect(receiver.procesar).toHaveBeenCalledWith(START, START, 28, { data: 'decoded' });
    },
  );
  it('reintenta conexion al bus y cancela el temporizador al cerrar', async () => {
    jest.useFakeTimers();
    consumer.connect.mockRejectedValueOnce(new Error('broker caido'));
    await service.iniciar();
    expect(service.estado().estado).toBe('ERROR');
    await jest.advanceTimersByTimeAsync(30000);
    expect(consumer.connect).toHaveBeenCalledTimes(2);
    await service.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(30000);
    expect(consumer.connect).toHaveBeenCalledTimes(2);
  });
  it('no se suscribe si faltan los tipos ni conecta despues del shutdown', async () => {
    gateway.listarTipos.mockResolvedValueOnce([]);
    await service.iniciar();
    expect(Kafka).not.toHaveBeenCalled();
    await service.onApplicationShutdown();
    await service.iniciar();
    expect(Kafka).not.toHaveBeenCalled();
  });
});
