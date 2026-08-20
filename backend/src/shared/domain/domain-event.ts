import { randomUUID } from 'crypto';

/**
 * Sobre comun de todo evento que publica este modulo.
 * Ver docs/arquitectura/contratos-de-eventos.md
 */
export interface DomainEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  source: string;
  version: number;
  correlationId?: string;
  payload: TPayload;
}

export const EVENT_SOURCE = 'residuos-service';

/**
 * Tipos de evento que publica el modulo. Centralizados aca para que un typo en
 * el nombre del topico sea un error de compilacion y no un evento que nadie recibe.
 */
export const EventTypes = {
  CONTENEDOR_CRITICO: 'residuos.contenedor.critico',
  INCENDIO_DETECTADO: 'residuos.incendio.detectado',
  CONTENEDOR_VACIADO: 'residuos.contenedor.vaciado',
  RUTA_GENERADA: 'residuos.ruta.generada',
  RUTA_ASIGNADA: 'residuos.ruta.asignada',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export function buildEvent<TPayload extends Record<string, unknown>>(
  eventType: EventType,
  payload: TPayload,
  options: { correlationId?: string; occurredAt?: Date; version?: number } = {},
): DomainEvent<TPayload> {
  return {
    eventId: randomUUID(),
    eventType,
    occurredAt: (options.occurredAt ?? new Date()).toISOString(),
    source: EVENT_SOURCE,
    version: options.version ?? 1,
    correlationId: options.correlationId,
    payload,
  };
}
