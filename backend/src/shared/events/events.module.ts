import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContextoTransaccional } from '../persistence/contexto-transaccional';
import { EVENT_PUBLISHER } from './event-publisher';
import { InMemoryEventPublisher } from './in-memory.event-publisher';
import { TRANSPORTE_EVENTOS } from './transporte-eventos';
import { DespachadorOutbox } from './outbox/despachador-outbox';
import { EventoPendiente } from './outbox/evento-pendiente.entity';
import { OutboxEventPublisher } from './outbox/outbox.event-publisher';
import { OUTBOX_REPOSITORY } from './outbox/outbox.repository';
import { OutboxTypeormRepository } from './outbox/outbox.typeorm.repository';

/**
 * Modulo global de eventos (ADR-003).
 *
 * El dominio publica contra EVENT_PUBLISHER, que escribe en la tabla outbox
 * dentro de la transaccion de negocio. El DespachadorOutbox la vacia despues
 * contra TRANSPORTE_EVENTOS, que es el broker.
 *
 * El transporte se elige por EVENT_BUS_DRIVER:
 *   inmemory  -> sprints 1 y 2, y tests
 *   rabbitmq  -> pendiente
 *   platform  -> bus real del Squad 1, sprint 3
 *
 * Cuando esos existan, el unico archivo que cambia sigue siendo este.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EventoPendiente])],
  providers: [
    ContextoTransaccional,
    InMemoryEventPublisher,
    OutboxEventPublisher,
    DespachadorOutbox,
    { provide: OUTBOX_REPOSITORY, useClass: OutboxTypeormRepository },
    {
      provide: TRANSPORTE_EVENTOS,
      inject: [ConfigService, InMemoryEventPublisher],
      useFactory: (config: ConfigService, inMemory: InMemoryEventPublisher) => {
        const driver = config.get<string>('EVENT_BUS_DRIVER', 'inmemory');

        if (driver === 'inmemory') {
          return inMemory;
        }

        throw new Error(
          `EVENT_BUS_DRIVER="${driver}" todavia no esta implementado. ` +
            `Drivers disponibles: inmemory. Ver ADR-003.`,
        );
      },
    },
    { provide: EVENT_PUBLISHER, useExisting: OutboxEventPublisher },
  ],
  exports: [
    EVENT_PUBLISHER,
    TRANSPORTE_EVENTOS,
    InMemoryEventPublisher,
    DespachadorOutbox,
    ContextoTransaccional,
    OUTBOX_REPOSITORY,
  ],
})
export class EventsModule {}
