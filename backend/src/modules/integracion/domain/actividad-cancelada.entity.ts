import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Actividad o reserva que Espacios cancelo (squad 6).
 *
 * El bus no ordena eventos de topicos distintos: la cancelacion puede llegar
 * antes que la creacion. Queda anotada para no volver a agendar la limpieza.
 */
@Entity('actividad_cancelada')
export class ActividadCancelada {
  /** El mismo id de Espacios: `actividadId`, `eventoId` o `reservaId`. */
  @PrimaryColumn({ length: 64 })
  actividadId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  canceladaEn!: Date;
}
