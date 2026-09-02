import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export enum EstadoEventoPendiente {
  PENDIENTE = 'PENDIENTE',
  PUBLICADO = 'PUBLICADO',
  /** Agoto los reintentos. Queda para inspeccion manual. */
  FALLIDO = 'FALLIDO',
}

/**
 * Tabla outbox (ADR-003).
 *
 * El evento se escribe aca dentro de la misma transaccion que el cambio de
 * negocio que lo origina. Un despachador aparte lo publica despues.
 *
 * Es lo que hace que la promesa del contrato de eventos sea cierta: la
 * transaccion de negocio nunca se revierte por una falla de publicacion, y el
 * evento no se pierde cuando el broker esta caido. Antes de esto, si el driver
 * fallaba, el contenedor quedaba marcado critico y nadie se enteraba nunca.
 *
 * La clave primaria es el `eventId` del propio evento: si el mismo evento se
 * intentara guardar dos veces, la base lo rechaza.
 */
@Entity('evento_pendiente')
@Index(['estado', 'proximoIntentoEn'])
export class EventoPendiente {
  @PrimaryColumn({ type: 'uuid' })
  eventId!: string;

  @Column({ length: 120 })
  eventType!: string;

  @Column({ type: 'jsonb' })
  sobre!: Record<string, unknown>;

  @Column({ type: 'enum', enum: EstadoEventoPendiente, default: EstadoEventoPendiente.PENDIENTE })
  estado!: EstadoEventoPendiente;

  @Column({ type: 'int', default: 0 })
  intentos!: number;

  @Column({ type: 'text', nullable: true })
  ultimoError!: string | null;

  @Column({ type: 'timestamptz' })
  proximoIntentoEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publicadoEn!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn!: Date;
}
