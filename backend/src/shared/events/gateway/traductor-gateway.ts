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
 *   residuos.intervencion.programada -> IntervencionProgramada
 *
 * Los eventos sin consumidores fuera del modulo (ruta generada, asignada, parada
 * omitida) devuelven null: no salen del modulo.
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

    case EventTypes.INTERVENCION_PROGRAMADA:
      return {
        tipo: 'IntervencionProgramada',
        datos: {
          intervencionId: p.intervencionId,
          emergenciaId: p.emergenciaId,
          contenedorId: p.contenedorId ?? null,
          latitud: ubicacion(p).lat,
          longitud: ubicacion(p).lng,
          programadaEn: p.programadaEn,
          correlationId,
          occurredAt: evento.occurredAt,
        },
      };

    default:
      return null;
  }
}
