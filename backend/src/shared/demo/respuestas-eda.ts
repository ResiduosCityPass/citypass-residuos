import { strict as assert } from 'node:assert';

export const RESPUESTAS_CLIMA = {
  ServicioAfectado: 'ACTIVA',
  RecuperacionPendiente: 'PENDIENTE_RECUPERACION',
  RecuperacionHabilitada: 'EN_RECUPERACION',
  ServicioRestablecido: 'RECUPERADA',
} as const;

export interface EventoAuditable {
  metadata: { source: string; eventType: string; eventId: string };
  data: {
    alertaId?: string;
    correlationId?: string;
    inundacionId?: string;
    estado?: string;
    zonaIds?: string[];
    eventId?: string;
    occurredAt?: string;
  };
}

/** Audita respuestas de nuestra cuenta. No afirma que se hayan realizado vaciados. */
export function verificarRespuestasEda(
  eventos: EventoAuditable[],
  esperado: { alertaId: string; inundacionId: string; zonaId: string; clientId: string },
) {
  return Object.entries(RESPUESTAS_CLIMA).map(([nombre, estado]) => {
    const tipo = `com.citypass.residuos.${nombre}`;
    const encontrados = eventos.filter(
      (e) => e.data.alertaId === esperado.alertaId && e.metadata.eventType === tipo,
    );
    assert(
      encontrados.length,
      `Falta ${nombre} en los eventos recientes de nuestra cuenta. No se confirmó la entrega.`,
    );
    for (const e of encontrados) {
      assert.equal(e.metadata.source, esperado.clientId, 'La respuesta proviene de otra cuenta.');
      assert.equal(e.data.correlationId, esperado.alertaId, 'Correlación incorrecta.');
      assert.equal(
        e.data.inundacionId,
        esperado.inundacionId,
        'La respuesta es de otra contingencia.',
      );
      assert.equal(e.data.zonaIds?.join(','), esperado.zonaId, 'Las zonas no coinciden.');
      assert.equal(e.data.estado, estado, 'Estado de respuesta incorrecto.');
      assert(
        e.metadata.eventId &&
          e.data.eventId &&
          e.data.occurredAt &&
          Number.isFinite(Date.parse(e.data.occurredAt)),
        'Faltan identificadores o la fecha del evento.',
      );
    }
    return {
      tipo,
      estado,
      eventIdEda: encontrados[0].metadata.eventId,
      eventIdDominio: encontrados[0].data.eventId,
    };
  });
}
