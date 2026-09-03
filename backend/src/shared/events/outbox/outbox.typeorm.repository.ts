import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ContextoTransaccional } from '../../persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../persistence/repositorio-typeorm';
import { DomainEvent } from '../../domain/domain-event';
import { EstadoEventoPendiente, EventoPendiente } from './evento-pendiente.entity';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class OutboxTypeormRepository
  extends RepositorioTypeorm<EventoPendiente>
  implements OutboxRepository
{
  constructor(
    @InjectRepository(EventoPendiente)
    repositorio: Repository<EventoPendiente>,
    contexto: ContextoTransaccional,
  ) {
    super(repositorio, contexto, EventoPendiente);
  }

  async encolar(evento: DomainEvent): Promise<void> {
    // Usa el repositorio de la transaccion en curso: el evento se guarda o se
    // revierte junto con el cambio de negocio que lo origino.
    const fila = this.repo().create({
      eventId: evento.eventId,
      eventType: evento.eventType,
      // El sobre completo, tal cual lo va a recibir el consumidor.
      sobre: { ...evento } as unknown as EventoPendiente['sobre'],
      estado: EstadoEventoPendiente.PENDIENTE,
      intentos: 0,
      proximoIntentoEn: new Date(),
    });

    // save y no insert: el tipo de la columna jsonb no encaja en el
    // QueryDeepPartialEntity que espera insert. La clave primaria es el
    // eventId del propio evento, asi que reintentar el mismo evento no
    // duplica la fila.
    await this.repo().save(fila);
  }

  tomarPendientes(limite: number): Promise<EventoPendiente[]> {
    return this.repo().find({
      where: {
        estado: EstadoEventoPendiente.PENDIENTE,
        proximoIntentoEn: LessThanOrEqual(new Date()),
      },
      order: { creadoEn: 'ASC' },
      take: limite,
    });
  }

  async marcarPublicado(eventId: string): Promise<void> {
    await this.repo().update(eventId, {
      estado: EstadoEventoPendiente.PUBLICADO,
      publicadoEn: new Date(),
      ultimoError: null,
    });
  }

  async registrarFallo(eventId: string, error: string, proximoIntentoEn: Date): Promise<void> {
    await this.repo().increment({ eventId }, 'intentos', 1);
    await this.repo().update(eventId, { ultimoError: error, proximoIntentoEn });
  }

  async marcarFallido(eventId: string, error: string): Promise<void> {
    await this.repo().increment({ eventId }, 'intentos', 1);
    await this.repo().update(eventId, {
      estado: EstadoEventoPendiente.FALLIDO,
      ultimoError: error,
    });
  }
}
