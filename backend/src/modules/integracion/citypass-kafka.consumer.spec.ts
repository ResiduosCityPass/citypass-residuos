import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayTransporte } from '../../shared/events/gateway/gateway.transporte';
import { IntegracionService } from './application/integracion.service';
import { CitypassKafkaConsumer } from './citypass-kafka.consumer';

describe('CitypassKafkaConsumer', () => {
  const sobre = { metadata: { eventId: 'e-1', eventType: 'x' }, data: {} };
  let integracion: jest.Mocked<Pick<IntegracionService, 'procesar'>>;
  let consumer: CitypassKafkaConsumer;

  beforeEach(() => {
    integracion = { procesar: jest.fn().mockResolvedValue('procesado') };
    consumer = new CitypassKafkaConsumer(
      integracion as unknown as IntegracionService,
      {} as GatewayTransporte,
      new ConfigService({}),
    );
  });

  it('manda el sobre al mismo procesar que el webhook', async () => {
    await consumer.alRecibir(sobre);

    expect(integracion.procesar).toHaveBeenCalledWith(sobre);
  });

  it('un evento mal formado se descarta: si tirara, trabaria la cola', async () => {
    integracion.procesar.mockRejectedValue(new BadRequestException({ code: 'EVENTO_MAL_FORMADO' }));

    await expect(consumer.alRecibir(sobre)).resolves.toBeUndefined();
  });

  it('cualquier otro error se relanza para que Kafka lo reintente', async () => {
    integracion.procesar.mockRejectedValue(new Error('la base no responde'));

    await expect(consumer.alRecibir(sobre)).rejects.toThrow('la base no responde');
  });

  it('sin KAFKA_BROKERS no se conecta', async () => {
    await expect(consumer.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
