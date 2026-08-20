import { EVENT_SOURCE, EventTypes, buildEvent } from './domain-event';

describe('buildEvent', () => {
  it('completa el sobre comun con los metadatos obligatorios', () => {
    const event = buildEvent(EventTypes.CONTENEDOR_CRITICO, { contenedorId: 'CT-0421' });

    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(event.eventType).toBe('residuos.contenedor.critico');
    expect(event.source).toBe(EVENT_SOURCE);
    expect(event.version).toBe(1);
    expect(() => new Date(event.occurredAt).toISOString()).not.toThrow();
  });

  it('genera un eventId distinto por evento, para que el consumidor pueda deduplicar', () => {
    const a = buildEvent(EventTypes.INCENDIO_DETECTADO, { contenedorId: 'CT-1' });
    const b = buildEvent(EventTypes.INCENDIO_DETECTADO, { contenedorId: 'CT-1' });

    expect(a.eventId).not.toBe(b.eventId);
  });

  it('propaga el correlationId para poder trazar la cadena causal entre modulos', () => {
    const event = buildEvent(
      EventTypes.CONTENEDOR_VACIADO,
      { contenedorId: 'CT-1' },
      { correlationId: 'corr-123' },
    );

    expect(event.correlationId).toBe('corr-123');
  });

  it('respeta el momento de ocurrencia cuando se lo pasan explicitamente', () => {
    const momento = new Date('2026-09-15T14:32:10.482Z');

    const event = buildEvent(EventTypes.RUTA_GENERADA, { rutaId: 'RT-1' }, { occurredAt: momento });

    expect(event.occurredAt).toBe('2026-09-15T14:32:10.482Z');
  });
});
