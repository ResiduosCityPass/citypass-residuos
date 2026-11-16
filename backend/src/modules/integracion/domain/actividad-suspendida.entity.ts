import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Actividad que Espacios suspendio (squad 6).
 *
 * A diferencia de la cancelacion, se puede reanudar: mientras dure no se agenda
 * la limpieza, y al reanudar se vuelve a agendar con los datos del evento.
 */
@Entity('actividad_suspendida')
export class ActividadSuspendida {
  /** El mismo id de Espacios: `actividadId` o `eventoId`. */
  @PrimaryColumn({ length: 64 })
  actividadId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  suspendidaEn!: Date;
}
