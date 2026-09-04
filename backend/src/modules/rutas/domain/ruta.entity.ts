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
import { Chofer } from '../../choferes/domain/chofer.entity';
import { Camion } from '../../flota/domain/camion.entity';
import { Parada } from './parada.entity';
import type { AvanceParadas } from './ruta.repository';

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
   * Chofer asignado. Es una clave foranea de verdad: los choferes son entidades
   * de este modulo.
   *
   * Antes era texto libre con el `sub` del token, bajo el supuesto de que los
   * choferes eran usuarios del Squad 2. Con texto libre nadie validaba nada: un
   * identificador mal tipeado asignaba la ruta igual y el chofer no la veia
   * nunca.
   */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  choferId!: string | null;

  @ManyToOne(() => Chofer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'choferId' })
  chofer?: Chofer;

  @Column({ type: 'enum', enum: EstadoRuta, default: EstadoRuta.PROPUESTA })
  estado!: EstadoRuta;

  @Column({ type: 'numeric', precision: 8, scale: 1, transformer: columnaNumerica })
  distanciaEstimadaKm!: number;

  @Column({ type: 'int' })
  litrosEstimados!: number;

  @OneToMany(() => Parada, (parada) => parada.ruta)
  paradas?: Parada[];

  /**
   * No se persiste: lo completa el listado. El detalle no lo trae porque ya
   * devuelve las paradas enteras y contarlas es trivial del lado del cliente.
   */
  avance?: AvanceParadas;

  @CreateDateColumn({ type: 'timestamptz' })
  generadaEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  asignadaEn!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completadaEn!: Date | null;
}
