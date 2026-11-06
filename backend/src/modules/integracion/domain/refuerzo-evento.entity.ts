import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Refuerzo de una actividad masiva de Espacios (squad 3). */
export const PREFIJO_ACTIVIDAD = 'act-';
/** Refuerzo de la reserva de un evento comunitario chico (squad 6). */
export const PREFIJO_RESERVA = 'res-';

/**
 * Causa que lee Analitica en IntervencionProgramada. null si el refuerzo no viene
 * de una actividad ni de una reserva, como los de CU-INT-01 o los de emergencias.
 */
export function causaDelRefuerzo(eventoId: string): { causaId: string; causaTipo: string } | null {
  if (eventoId.startsWith(PREFIJO_ACTIVIDAD)) {
    return { causaId: eventoId.slice(PREFIJO_ACTIVIDAD.length), causaTipo: 'EVENTO_PUBLICO' };
  }
  if (eventoId.startsWith(PREFIJO_RESERVA)) {
    return { causaId: eventoId.slice(PREFIJO_RESERVA.length), causaTipo: 'RESERVA' };
  }
  return null;
}

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
