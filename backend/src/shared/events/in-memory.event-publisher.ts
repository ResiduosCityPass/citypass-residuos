import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '../domain/domain-event';
import { EventPublisher } from './event-publisher';

/**
 * Driver `inmemory` (ADR-003).
 *
 * Guarda los eventos en memoria y los loguea. Es el driver por defecto durante
 * los sprints 1 y 2, donde el Hito 1 pide explicitamente un modulo funcional
 * *sin* integracion. Tambien es el doble que usan los tests unitarios: permite
 * verificar que un caso de uso publico lo que debia sin levantar un broker.
 */
@Injectable()
export class InMemoryEventPublisher implements EventPublisher {
  private readonly logger = new Logger(InMemoryEventPublisher.name);
  private readonly events: DomainEvent[] = [];

  async publish<T extends Record<string, unknown>>(event: DomainEvent<T>): Promise<void> {
    this.events.push(event as DomainEvent);
    this.logger.log(`[${event.eventType}] ${event.eventId} :: ${JSON.stringify(event.payload)}`);
  }

  /** Solo para tests y para diagnostico en perfil de desarrollo. */
  getPublished(eventType?: string): DomainEvent[] {
    return eventType ? this.events.filter((e) => e.eventType === eventType) : [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}
