import { EventTypes, buildEvent } from '../../domain/domain-event';
import { traducirAGateway } from './traductor-gateway';

describe('traducirAGateway (CU-INT-01)', () => {
  const ubicacion = { lat: -34.6118, lng: -58.396 };

  it('la intervencion sale como IntervencionProgramada con el correlationId de la emergencia', () => {
    const evento = buildEvent(
      EventTypes.INTERVENCION_PROGRAMADA,
      {
        intervencionId: 'in-1',
        emergenciaId: 'EMG-1',
        contenedorId: 'ct-1',
        ubicacion,
        programadaEn: '2026-11-01T15:00:00.000Z',
      },
      { correlationId: 'EMG-1' },
    );

    expect(traducirAGateway(evento)).toEqual({
      tipo: 'IntervencionProgramada',
      datos: {
        intervencionId: 'in-1',
        emergenciaId: 'EMG-1',
        contenedorId: 'ct-1',
        latitud: ubicacion.lat,
        longitud: ubicacion.lng,
        programadaEn: Date.parse('2026-11-01T15:00:00.000Z'),
        correlationId: 'EMG-1',
        occurredAt: Date.parse(evento.occurredAt),
      },
    });
  });

  it('la intervencion completada sale como IntervencionCompletada con fechas en ms', () => {
    const evento = buildEvent(
      EventTypes.INTERVENCION_COMPLETADA,
      { intervencionId: 'in-1', emergenciaId: 'EMG-1', completadaEn: '2026-11-01T17:00:00.000Z' },
      { correlationId: 'EMG-1' },
    );

    expect(traducirAGateway(evento)).toEqual({
      tipo: 'IntervencionCompletada',
      datos: {
        intervencionId: 'in-1',
        emergenciaId: 'EMG-1',
        completadaEn: Date.parse('2026-11-01T17:00:00.000Z'),
        correlationId: 'EMG-1',
        occurredAt: Date.parse(evento.occurredAt),
      },
    });
  });

  it('la saturacion sale como AlertaGenerada con su alertaId', () => {
    const evento = buildEvent(
      EventTypes.CONTENEDOR_CRITICO,
      {
        alertaId: 'al-1',
        severidad: 'ALTA',
        contenedorId: 'CT-0421',
        zonaId: 'Centro',
        nivelLlenado: 87.4,
        ubicacion,
        detectadoEn: '2026-11-01T15:00:00.000Z',
      },
      { correlationId: 'corr-1' },
    );

    expect(traducirAGateway(evento)).toEqual({
      tipo: 'AlertaGenerada',
      datos: {
        alertaId: 'al-1',
        contenedorId: 'CT-0421',
        tipoAlerta: 'SATURACION',
        nivelLlenado: 87.4,
        zona: 'Centro',
        prioridad: 'ALTA',
        latitud: -34.6118,
        longitud: -58.396,
        correlationId: 'corr-1',
        occurredAt: '2026-11-01T15:00:00.000Z',
      },
    });
  });

  it('el incendio sale como AlertaGenerada de tipo INCENDIO y prioridad CRITICA', () => {
    const evento = buildEvent(EventTypes.INCENDIO_DETECTADO, {
      alertaId: 'al-2',
      contenedorId: 'CT-0421',
      zonaId: 'Centro',
      ubicacion,
      severidad: 'CRITICA',
      detectadoEn: '2026-11-01T15:00:00.000Z',
    });

    const traducido = traducirAGateway(evento);

    expect(traducido?.datos).toMatchObject({
      tipoAlerta: 'INCENDIO',
      prioridad: 'CRITICA',
      nivelLlenado: null,
      correlationId: null,
    });
  });

  it('el vaciado sale como RecoleccionCompletada unida a la alerta que resolvio', () => {
    const evento = buildEvent(EventTypes.CONTENEDOR_VACIADO, {
      contenedorId: 'CT-0421',
      paradaId: 'pa-9',
      alertaIds: ['al-1'],
      camionId: 'AB123CD',
      confirmadoEn: '2026-11-01T16:05:22.100Z',
    });

    expect(traducirAGateway(evento)?.datos).toMatchObject({
      alertaId: 'al-1',
      recoleccionId: 'pa-9',
      camionId: 'AB123CD',
      occurredAt: '2026-11-01T16:05:22.100Z',
    });
  });

  it('un vaciado sin alerta abierta lleva alertaId null', () => {
    const evento = buildEvent(EventTypes.CONTENEDOR_VACIADO, {
      contenedorId: 'CT-1',
      alertaIds: [],
      camionId: 'AB123CD',
    });

    expect(traducirAGateway(evento)?.datos.alertaId).toBeNull();
  });

  it('la evaluacion de un reclamo sale como ReclamoEvaluado (CU-INT-02)', () => {
    const evento = buildEvent(EventTypes.RECLAMO_EVALUADO, {
      reclamoId: 'RC-123',
      afectaRecoleccion: true,
      contenedoresAfectados: [{ codigo: 'CT-0421', distanciaMetros: 8.4 }],
      rutasRecalculadas: ['rt-1'],
      evaluadoEn: '2026-10-22T18:00:00.000Z',
    });

    expect(traducirAGateway(evento)).toEqual({
      tipo: 'ReclamoEvaluado',
      datos: {
        reclamoId: 'RC-123',
        afectaRecoleccion: true,
        contenedoresAfectados: [{ codigo: 'CT-0421', distanciaMetros: 8.4 }],
        rutasRecalculadas: ['rt-1'],
        correlationId: null,
        // En milisegundos desde epoch: es lo que lee Analitica.
        occurredAt: 1792692000000,
      },
    });
  });

  it('los eventos sin consumidores fuera del modulo no salen', () => {
    expect(traducirAGateway(buildEvent(EventTypes.RUTA_GENERADA, { rutaId: 'rt-1' }))).toBeNull();
    expect(
      traducirAGateway(buildEvent(EventTypes.PARADA_OMITIDA, { paradaId: 'pa-1' })),
    ).toBeNull();
    expect(
      traducirAGateway(buildEvent(EventTypes.RUTA_RECALCULADA, { rutaId: 'rt-1' })),
    ).toBeNull();
  });
});
