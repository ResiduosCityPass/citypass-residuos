import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Actividad masiva publicada por Espacios (squad 3, ActividadCreada).
 *
 * Guarda el centro y los contenedores cercanos: cuando termina la actividad,
 * la escuadrilla sale a limpiar esos contenedores.
 */
@Entity('actividad_masiva')
export class ActividadMasiva {
  /** `communityEventId` de Espacios. */
  @PrimaryColumn({ length: 64 })
  actividadId!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  titulo!: string | null;

  @Column({ type: 'int' })
  capacidad!: number;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'timestamptz' })
  inicio!: Date;

  @Column({ type: 'timestamptz' })
  fin!: Date;

  @Column({ type: 'jsonb' })
  contenedorIds!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn!: Date;
}
