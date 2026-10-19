import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Zonas bloqueadas para el ruteo por una emergencia que corta la circulacion
 * (incendio, derrumbe, disturbio). Se guardan las zonas que esta emergencia
 * mantiene bloqueadas, aunque las comparta con otra emergencia activa, pero
 * nunca las que bloqueo un operador a mano: al cerrarla esas no se tocan.
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
