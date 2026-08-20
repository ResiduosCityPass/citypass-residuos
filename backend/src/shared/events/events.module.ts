import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENT_PUBLISHER } from './event-publisher';
import { InMemoryEventPublisher } from './in-memory.event-publisher';

/**
 * Modulo global de eventos (ADR-003).
 *
 * El driver se elige por la variable EVENT_BUS_DRIVER:
 *   inmemory  -> sprints 1-2 y tests
 *   rabbitmq  -> sprint 2, validacion end-to-end del flujo asincronico
 *   platform  -> sprint 3, bus real del Squad 1
 *
 * Los drivers rabbitmq y platform todavia no existen. Cuando se agreguen, el
 * unico archivo que cambia es este.
 */
@Global()
@Module({
  providers: [
    InMemoryEventPublisher,
    {
      provide: EVENT_PUBLISHER,
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
  ],
  exports: [EVENT_PUBLISHER, InMemoryEventPublisher],
})
export class EventsModule {}
