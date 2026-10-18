import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Zonas bloqueadas para el ruteo por una emergencia que corta la circulacion
 * (incendio, derrumbe, disturbio). Se guardan solo las que bloqueo esta
 * emergencia, para no desbloquear al cerrarla una zona que un operador bloqueo a mano.
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
