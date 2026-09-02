import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoRuta } from '../../../shared/domain/enums';
import { columnaNumerica } from '../../../shared/persistence/columna-numerica';
import { Camion } from '../../flota/domain/camion.entity';
import { Parada } from './parada.entity';

/**
 * Recorrido de recoleccion (CU-08, CU-09).
 *
 * Nace como PROPUESTA: la heuristica propone y una persona confirma. Esa
 * separacion es toda la razon de ser de CU-09, y el unico momento en que
 * alguien puede notar que la propuesta es absurda.
 */
@Entity('ruta')
@Index(['estado'])
export class Ruta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  camionId!: string;

  @ManyToOne(() => Camion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'camionId' })
  camion?: Camion;

  /**
   * Identificador del chofer en el modulo de identidad del Squad 2: el `sub`
   * de su JWT. No es una clave foranea porque los usuarios no son entidades
   * nuestras.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  @Index()
  choferId!: string | null;

  @Column({ type: 'enum', enum: EstadoRuta, default: EstadoRuta.PROPUESTA })
  estado!: EstadoRuta;

  @Column({ type: 'numeric', precision: 8, scale: 1, transformer: columnaNumerica })
  distanciaEstimadaKm!: number;

  @Column({ type: 'int' })
  litrosEstimados!: number;

  @OneToMany(() => Parada, (parada) => parada.ruta)
  paradas?: Parada[];

  @CreateDateColumn({ type: 'timestamptz' })
  generadaEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  asignadaEn!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completadaEn!: Date | null;
}
