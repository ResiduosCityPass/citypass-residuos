import { DomainEvent } from '../domain/domain-event';

/**
 * Contrato de publicacion de eventos (ADR-003).
 *
 * El dominio depende de esta interfaz, nunca de un broker concreto. Cuando el
 * Squad 1 defina el bus real, se agrega una implementacion nueva y no se toca
 * una sola linea de logica de negocio.
 */
export interface EventPublisher {
  publish<T extends Record<string, unknown>>(event: DomainEvent<T>): Promise<void>;
}

/** Token de inyeccion: NestJS no puede inyectar interfaces de TypeScript. */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
