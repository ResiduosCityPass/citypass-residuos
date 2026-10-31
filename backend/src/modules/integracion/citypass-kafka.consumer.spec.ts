import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { GatewayTransporte } from '../../shared/events/gateway/gateway.transporte';
import { IntegracionService } from './application/integracion.service';
import { CitypassKafkaConsumer } from './citypass-kafka.consumer';

const kafka = {
  connect: jest.fn(),
  subscribe: jest.fn(),
  run: jest.fn(),
  disconnect: jest.fn(),
};
let configKafka: Record<string, unknown> = {};

jest.mock('kafkajs', () => ({
  ...jest.requireActual<object>('kafkajs'),
  Kafka: jest.fn().mockImplementation((config: Record<string, unknown>) => {
    configKafka = config;
    return { consumer: () => kafka };
  }),
}));

describe('CitypassKafkaConsumer', () => {
  const sobre = { metadata: { eventId: 'e-1', eventType: 'x' }, data: {} };
  // Formato Confluent: byte 0, id del esquema (7) y despues el Avro.
  const mensaje = Buffer.from([0, 0, 0, 0, 7, 1, 2, 3]);
  let integracion: jest.Mocked<Pick<IntegracionService, 'procesar'>>;
  let getSchema: jest.SpyInstance;
  let decode: jest.SpyInstance;
  let consumer: CitypassKafkaConsumer;

  beforeEach(() => {
    integracion = { procesar: jest.fn().mockResolvedValue('procesado') };
    getSchema = jest.spyOn(SchemaRegistry.prototype, 'getSchema').mockResolvedValue({} as never);
    decode = jest.spyOn(SchemaRegistry.prototype, 'decode').mockResolvedValue(sobre);
    consumer = new CitypassKafkaConsumer(
      integracion as unknown as IntegracionService,
      {} as GatewayTransporte,
      new ConfigService({}),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('manda el sobre decodificado al mismo procesar que el webhook', async () => {
    await consumer.alRecibir(mensaje);

    expect(getSchema).toHaveBeenCalledWith(7);
    expect(integracion.procesar).toHaveBeenCalledWith(sobre);
  });

  it('un evento mal formado se descarta: si tirara, trabaria la cola', async () => {
    integracion.procesar.mockRejectedValue(new BadRequestException({ code: 'EVENTO_MAL_FORMADO' }));

    await expect(consumer.alRecibir(mensaje)).resolves.toBeUndefined();
  });

  it('si falla la base, se relanza para que Kafka lo reintente', async () => {
    integracion.procesar.mockRejectedValue(new Error('la base no responde'));

    await expect(consumer.alRecibir(mensaje)).rejects.toThrow('la base no responde');
  });

  it.each([
    ['vacio', null],
    ['sin el formato de Confluent', Buffer.from('{"metadata":{}}')],
  ])('un mensaje %s se descarta sin ir al registry', async (_caso, valor) => {
    await expect(consumer.alRecibir(valor)).resolves.toBeUndefined();

    expect(getSchema).not.toHaveBeenCalled();
    expect(integracion.procesar).not.toHaveBeenCalled();
  });

  it('un Avro que no se puede decodificar se descarta', async () => {
    decode.mockRejectedValue(new Error('truncated buffer'));

    await expect(consumer.alRecibir(mensaje)).resolves.toBeUndefined();
    expect(integracion.procesar).not.toHaveBeenCalled();
  });

  it('un esquema que el gateway no conoce se descarta', async () => {
    getSchema.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

    await expect(consumer.alRecibir(mensaje)).resolves.toBeUndefined();
    expect(integracion.procesar).not.toHaveBeenCalled();
  });

  it('si el registry no responde, se relanza para que Kafka lo reintente', async () => {
    getSchema.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(consumer.alRecibir(mensaje)).rejects.toThrow('ECONNREFUSED');
    expect(integracion.procesar).not.toHaveBeenCalled();
  });

  it('sin KAFKA_BROKERS no se conecta', async () => {
    kafka.connect.mockClear();

    await consumer.onApplicationBootstrap();

    expect(kafka.connect).not.toHaveBeenCalled();
  });

  describe('con KAFKA_BROKERS', () => {
    const conBrokers = () =>
      new CitypassKafkaConsumer(
        integracion as unknown as IntegracionService,
        { obtenerToken: jest.fn().mockResolvedValue('jwt') } as unknown as GatewayTransporte,
        new ConfigService({ KAFKA_BROKERS: 'bus:9092, bus2:9092' }),
      );
    const conectado = () => new Promise((resolver) => setImmediate(resolver));

    beforeEach(() => {
      Object.values(kafka).forEach((f) => f.mockReset());
    });

    it('se suscribe desde lo ultimo y manda cada mensaje a alRecibir', async () => {
      const kafkaConsumer = conBrokers();
      await kafkaConsumer.onApplicationBootstrap();
      await conectado();

      expect(configKafka).toMatchObject({ brokers: ['bus:9092', 'bus2:9092'], ssl: true });
      expect(kafka.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({ fromBeginning: false }),
      );

      const { eachMessage } = kafka.run.mock.calls[0][0];
      await eachMessage({ message: { value: mensaje } });
      expect(integracion.procesar).toHaveBeenCalledWith(sobre);
    });

    it('pide el token del SASL al mismo emisor que el gateway', async () => {
      await conBrokers().onApplicationBootstrap();

      const sasl = configKafka.sasl as { oauthBearerProvider: () => Promise<unknown> };
      await expect(sasl.oauthBearerProvider()).resolves.toEqual({ value: 'jwt' });
    });

    it('si el broker no responde, la API arranca igual', async () => {
      kafka.connect.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(conBrokers().onApplicationBootstrap()).resolves.toBeUndefined();
      await conectado();
      expect(kafka.run).not.toHaveBeenCalled();
    });

    it('al apagar la API se desconecta', async () => {
      const kafkaConsumer = conBrokers();
      await kafkaConsumer.onApplicationBootstrap();

      await kafkaConsumer.onApplicationShutdown();

      expect(kafka.disconnect).toHaveBeenCalled();
    });
  });
});
