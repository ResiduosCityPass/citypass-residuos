import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Zonas bloqueadas para el ruteo por una emergencia que corta la circulacion
 * (incendio, derrumbe, disturbio). Se guardan todas las zonas afectadas, aunque
 * otra emergencia o un operador ya las tuviera bloqueadas: el bloqueo manual se
 * guarda aparte en la zona (`Zona.bloqueoManual`) y sobrevive al cierre.
 */
@Entity('bloqueo_por_incidente')
export class BloqueoPorIncidente {
  @PrimaryColumn({ length: 64 })
  emergenciaId!: string;

  @Column({ type: 'jsonb' })
  zonaIds!: string[];

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn!: Date;
}
