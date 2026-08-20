import { EventTypes, buildEvent } from '../domain/domain-event';
import { InMemoryEventPublisher } from './in-memory.event-publisher';

describe('InMemoryEventPublisher', () => {
  let publisher: InMemoryEventPublisher;

  beforeEach(() => {
    publisher = new InMemoryEventPublisher();
  });

  it('guarda el evento publicado', async () => {
    const event = buildEvent(EventTypes.CONTENEDOR_CRITICO, { contenedorId: 'CT-0421' });

    await publisher.publish(event);

    expect(publisher.getPublished()).toHaveLength(1);
    expect(publisher.getPublished()[0].eventId).toBe(event.eventId);
  });

  it('filtra por tipo de evento', async () => {
    await publisher.publish(buildEvent(EventTypes.CONTENEDOR_CRITICO, { contenedorId: 'CT-1' }));
    await publisher.publish(buildEvent(EventTypes.INCENDIO_DETECTADO, { contenedorId: 'CT-2' }));

    const incendios = publisher.getPublished(EventTypes.INCENDIO_DETECTADO);

    expect(incendios).toHaveLength(1);
    expect(incendios[0].payload).toEqual({ contenedorId: 'CT-2' });
  });

  it('limpia los eventos acumulados', async () => {
    await publisher.publish(buildEvent(EventTypes.RUTA_GENERADA, { rutaId: 'RT-1' }));

    publisher.clear();

    expect(publisher.getPublished()).toHaveLength(0);
  });
});
