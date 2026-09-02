import { DomainEvent } from '../../domain/domain-event';
import { EventoPendiente } from './evento-pendiente.entity';

export interface OutboxRepository {
  /** Guarda el evento en la transaccion en curso, si hay una. */
  encolar(evento: DomainEvent): Promise<void>;
  /** Eventos pendientes cuyo proximo intento ya vencio. */
  tomarPendientes(limite: number): Promise<EventoPendiente[]>;
  marcarPublicado(eventId: string): Promise<void>;
  registrarFallo(eventId: string, error: string, proximoIntentoEn: Date): Promise<void>;
  marcarFallido(eventId: string, error: string): Promise<void>;
}

export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');
