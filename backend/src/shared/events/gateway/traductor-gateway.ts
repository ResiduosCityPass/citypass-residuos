import { DomainEvent, EventTypes } from '../../domain/domain-event';

/** Evento tal como lo recibe el gateway: el nombre corto del tipo y los campos de negocio. */
export interface EventoGateway {
  tipo: string;
  datos: Record<string, unknown>;
}

type Payload = Record<string, unknown>;

const ubicacion = (payload: Payload): { lat: number; lng: number } =>
  payload.ubicacion as { lat: number; lng: number };

/**
 * Traduce un evento del dominio al tipo que espera el bus de CityPass+ (CU-INT-01).
 *
 * Los nombres y campos son el contrato entre equipos (catalogo event-types.json
 * del repo del gateway) y coinciden con lo que lee la capa silver de Analitica:
 *
 *   residuos.contenedor.critico   -> AlertaGenerada (tipoAlerta SATURACION)
 *   residuos.incendio.detectado   -> AlertaGenerada (tipoAlerta INCENDIO)
 *   residuos.contenedor.vaciado   -> RecoleccionCompletada
 *   residuos.refuerzo.programado  -> RefuerzoProgramado
 *   residuos.reclamo.evaluado     -> ReclamoEvaluado (CU-INT-02, la respuesta a Reclamos)
 *   residuos.intervencion.actualizada -> IntervencionActualizada (cuadrillas afectadas)
 *
 * Los eventos sin consumidores fuera del modulo (ruta generada, asignada,
 * recalculada, parada omitida) devuelven null: no salen del modulo.
 *
 * Un tipo nuevo tambien tiene que estar en el catalogo del gateway: si no, el
 * gateway responde 404 y el evento queda FALLIDO en el outbox.
 */
export function traducirAGateway(evento: DomainEvent): EventoGateway | null {
  const p = evento.payload as Payload;
  const correlationId = evento.correlationId ?? null;

  switch (evento.eventType) {
    case EventTypes.CONTENEDOR_CRITICO:
      return {
        tipo: 'AlertaGenerada',
        datos: {
          alertaId: p.alertaId,
          contenedorId: p.contenedorId,
          tipoAlerta: 'SATURACION',
          nivelLlenado: p.nivelLlenado ?? null,
          zona: p.zonaId,
          prioridad: p.severidad ?? 'ALTA',
          latitud: ubicacion(p).lat,
          longitud: ubicacion(p).lng,
          correlationId,
          occurredAt: p.detectadoEn ?? evento.occurredAt,
        },
      };

    case EventTypes.INCENDIO_DETECTADO:
      return {
        tipo: 'AlertaGenerada',
        datos: {
          alertaId: p.alertaId,
          contenedorId: p.contenedorId,
          tipoAlerta: 'INCENDIO',
          nivelLlenado: null,
          zona: p.zonaId,
          prioridad: p.severidad ?? 'CRITICA',
          latitud: ubicacion(p).lat,
          longitud: ubicacion(p).lng,
          correlationId,
          occurredAt: p.detectadoEn ?? evento.occurredAt,
        },
      };

    case EventTypes.CONTENEDOR_VACIADO: {
      const alertaIds = (p.alertaIds as string[] | undefined) ?? [];
      return {
        tipo: 'RecoleccionCompletada',
        datos: {
          // Analitica une la recoleccion con su alerta para medir el tiempo de respuesta.
          alertaId: alertaIds[0] ?? null,
          recoleccionId: p.paradaId ?? evento.eventId,
          contenedorId: p.contenedorId,
          camionId: p.camionId,
          correlationId,
          occurredAt: p.confirmadoEn ?? evento.occurredAt,
        },
      };
    }

    case EventTypes.REFUERZO_PROGRAMADO:
      return {
        tipo: 'RefuerzoProgramado',
        datos: {
          refuerzoId: p.refuerzoId,
          eventoId: p.eventoId,
          zona: p.zona,
          contenedores: p.contenedores,
          programadoPara: p.programadoPara,
          occurredAt: evento.occurredAt,
        },
      };

    case EventTypes.RECLAMO_EVALUADO:
      return {
        tipo: 'ReclamoEvaluado',
        datos: {
          reclamoId: p.reclamoId,
          afectaRecoleccion: p.afectaRecoleccion,
          contenedoresAfectados: p.contenedoresAfectados,
          rutasRecalculadas: p.rutasRecalculadas,
          correlationId,
          // Milisegundos desde epoch, no ISO: es lo que lee Analitica, y EDA lo
          // recomendo para los eventos nuevos (26/10). Los anteriores siguen en ISO.
          occurredAt: Date.parse(String(p.evaluadoEn ?? evento.occurredAt)),
        },
      };

    case EventTypes.INTERVENCION_ACTUALIZADA:
      return {
        tipo: 'IntervencionActualizada',
        datos: {
          intervencionId: p.intervencionId,
          camionId: p.camionId,
          estadoAnterior: p.estadoAnterior,
          estadoNuevo: p.estadoNuevo,
          causaId: p.causaId,
          causaTipo: p.causaTipo,
          correlationId,
          // En ISO, como pide el contrato de Analitica del 29/10.
          updatedAt: p.updatedAt,
        },
      };

    default:
      return null;
  }
}
