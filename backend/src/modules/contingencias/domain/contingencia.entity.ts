import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { Zona } from '../../zonas/domain/zona.entity';

export enum EstadoContingencia {
  ACTIVA = 'ACTIVA',
  PENDIENTE_RECUPERACION = 'PENDIENTE_RECUPERACION',
  EN_RECUPERACION = 'EN_RECUPERACION',
  RECUPERADA = 'RECUPERADA',
}

@Entity('contingencia')
export class Contingencia {
  /** Identificador local de la contingencia; alertaId conserva el ID externo de Espacios. */
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) alertaId?: string | null;
  @Column({ length: 200 }) descripcion!: string;
  @Column({ type: 'varchar', length: 30 }) estado!: EstadoContingencia;
  @Column({ type: 'int' }) revision!: number;
  @Column({ type: 'timestamptz' }) iniciadaEn!: Date;
  @Column({ type: 'timestamptz', nullable: true }) finalizadaEn!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) recuperacionEn!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) recuperadaEn!: Date | null;
  @Column({ type: 'uuid' }) correlationId!: string;
  @OneToMany(() => ContingenciaZona, (z) => z.contingencia) zonas?: ContingenciaZona[];
  @OneToMany(() => ContingenciaContenedor, (c) => c.contingencia)
  contenedores?: ContingenciaContenedor[];
}

@Entity('contingencia_zona')
export class ContingenciaZona {
  @PrimaryColumn('uuid') contingenciaId!: string;
  @PrimaryColumn('uuid') zonaId!: string;
  @ManyToOne(() => Contingencia, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contingenciaId' })
  contingencia?: Contingencia;
  @ManyToOne(() => Zona, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'zonaId' })
  zona?: Zona;
}

@Entity('contingencia_contenedor')
export class ContingenciaContenedor {
  @PrimaryColumn('uuid') contingenciaId!: string;
  @PrimaryColumn('uuid') contenedorId!: string;
  @Column({ type: 'timestamptz', nullable: true }) vaciadoEn!: Date | null;
  @ManyToOne(() => Contingencia, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contingenciaId' })
  contingencia?: Contingencia;
  @ManyToOne(() => Contenedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contenedorId' })
  contenedor?: Contenedor;
}

@Entity('evento_climatico_recibido')
export class EventoClimaticoRecibido {
  @PrimaryColumn('uuid') eventId!: string;
  @Column({ length: 64 }) huella!: string;
}
