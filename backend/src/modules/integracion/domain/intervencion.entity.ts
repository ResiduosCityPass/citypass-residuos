import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { columnaNumerica } from '../../../shared/persistence/columna-numerica';

export enum EstadoIntervencion {
  PROGRAMADA = 'PROGRAMADA',
  COMPLETADA = 'COMPLETADA',
}

/**
 * Intervencion en el lugar de una emergencia (CU-01 de Emergencias, alternativa A7).
 *
 * Se crea cuando Emergencias resuelve un incidente y marca `RESIDUOS` entre las
 * causas relacionadas: un contenedor en la ciclovia, residuos en la calzada.
 * `emergenciaId` es unico: es lo que impide dos intervenciones por la misma
 * emergencia cuando el aviso llega por dos eventos distintos.
 *
 * `contenedorId` es nullable a proposito: la causa puede ser basura suelta y no
 * haber ningun contenedor cerca. La intervencion se programa igual.
 */
@Entity('intervencion')
export class Intervencion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  emergenciaId!: string;

  @Column({ type: 'numeric', precision: 10, scale: 7, transformer: columnaNumerica })
  lat!: number;

  @Column({ type: 'numeric', precision: 10, scale: 7, transformer: columnaNumerica })
  lng!: number;

  @Column({ type: 'uuid', nullable: true })
  contenedorId!: string | null;

  @Column({ type: 'int', nullable: true })
  distanciaMetros!: number | null;

  @Column({ type: 'varchar', length: 20, default: EstadoIntervencion.PROGRAMADA })
  estado!: EstadoIntervencion;

  @Column({ type: 'timestamptz' })
  programadaEn!: Date;

  /** Cuando el operador marco que la cuadrilla ya intervino. */
  @Column({ type: 'timestamptz', nullable: true })
  completadaEn!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn!: Date;
}
