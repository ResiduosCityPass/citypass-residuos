import { EventTypes, buildEvent } from '../../domain/domain-event';
import { OutboxRepository } from './outbox.repository';
import { OutboxEventPublisher } from './outbox.event-publisher';

describe('OutboxEventPublisher', () => {
  let outbox: jest.Mocked<OutboxRepository>;
  let publisher: OutboxEventPublisher;

  beforeEach(() => {
    outbox = {
      encolar: jest.fn(),
      tomarPendientes: jest.fn(),
      marcarPublicado: jest.fn(),
      registrarFallo: jest.fn(),
      marcarFallido: jest.fn(),
    };
    publisher = new OutboxEventPublisher(outbox);
  });

  it('encola el evento en lugar de mandarlo a un broker', async () => {
    const evento = buildEvent(EventTypes.CONTENEDOR_CRITICO, { contenedorId: 'CT-0421' });

    await publisher.publish(evento);

    expect(outbox.encolar).toHaveBeenCalledWith(evento);
  });

  it('propaga el error si no se puede encolar', async () => {
    // Si el evento no se puede guardar, la transaccion de negocio tiene que
    // revertir: es preferible no registrar la lectura a registrarla sin que
    // nadie se entere de la alerta.
    outbox.encolar.mockRejectedValue(new Error('sin conexion'));

    await expect(
      publisher.publish(buildEvent(EventTypes.INCENDIO_DETECTADO, { contenedorId: 'CT-1' })),
    ).rejects.toThrow('sin conexion');
  });
});
