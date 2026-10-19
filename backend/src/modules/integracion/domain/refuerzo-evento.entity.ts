import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Refuerzo de recoleccion por un evento cultural (CU-INT-01).
 *
 * Entre `desde` y `hasta` los contenedores listados entran al ruteo de CU-08
 * aunque no esten criticos: despues de un evento masivo se van a llenar, y es
 * mas barato levantarlos en la misma pasada que esperar la alerta.
 */
@Entity('refuerzo_evento')
export class RefuerzoEvento {
  /** Id del evento en el modulo de Espacios Publicos. */
  @PrimaryColumn({ length: 64 })
  eventoId!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  zona!: string | null;

  @Column({ type: 'jsonb' })
  contenedorIds!: string[];

  @Column({ type: 'timestamptz' })
  desde!: Date;

  @Column({ type: 'timestamptz' })
  hasta!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn!: Date;
}
