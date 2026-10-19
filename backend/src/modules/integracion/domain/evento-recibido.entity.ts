import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Evento recibido por webhook desde el bus de CityPass+ (CU-INT-01).
 * La entrega es at-least-once: guardar el eventId evita procesarlo dos veces.
 */
@Entity('evento_recibido')
export class EventoRecibido {
  @PrimaryColumn({ length: 64 })
  eventId!: string;

  @Column({ length: 150 })
  eventType!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  recibidoEn!: Date;
}
