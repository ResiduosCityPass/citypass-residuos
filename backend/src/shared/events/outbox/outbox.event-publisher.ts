import { Inject, Injectable } from '@nestjs/common';
import { DomainEvent } from '../../domain/domain-event';
import { EventPublisher } from '../event-publisher';
import { OUTBOX_REPOSITORY, OutboxRepository } from './outbox.repository';

/**
 * Publicador que el dominio usa (ADR-003).
 *
 * No habla con ningun broker: escribe el evento en la tabla outbox, dentro de
 * la misma transaccion que el cambio de negocio. El envio real lo hace despues
 * el despachador.
 *
 * Para quien lo llama, `publish` sigue significando "este evento ocurrio y va a
 * salir". Lo que cambia es que ahora esa promesa es cierta aunque el broker
 * este caido.
 */
@Injectable()
export class OutboxEventPublisher implements EventPublisher {
  constructor(
    @Inject(OUTBOX_REPOSITORY)
    private readonly outbox: OutboxRepository,
  ) {}

  async publish<T extends Record<string, unknown>>(event: DomainEvent<T>): Promise<void> {
    await this.outbox.encolar(event as DomainEvent);
  }
}
