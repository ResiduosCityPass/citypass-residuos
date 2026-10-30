import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { columnaNumerica } from '../../../shared/persistence/columna-numerica';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';

/**
 * Contenedor tapado por un auto mal estacionado que denuncio un ciudadano
 * (CU-INT-02). Una fila por contenedor afectado.
 *
 * Mientras este vigente, el contenedor queda fuera del ruteo de CU-08. Deja de
 * estarlo cuando Reclamos avisa que se resolvio (`resueltaEn`) o cuando pasa
 * `venceEn`, lo que ocurra primero: si el aviso nunca llega, el contenedor no
 * queda afuera para siempre.
 *
 * Es una tabla y no un booleano en el contenedor porque dos reclamos pueden
 * tapar el mismo contenedor, y resolver uno no tiene que destaparlo.
 */
@Entity('obstruccion_por_reclamo')
@Index('UQ_obstruccion_reclamo_contenedor', ['reclamoId', 'contenedorId'], { unique: true })
export class ObstruccionPorReclamo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id del reclamo en el modulo de Reclamos (Squad 5). */
  @Column({ length: 64 })
  reclamoId!: string;

  @Column({ type: 'uuid' })
  contenedorId!: string;

  @ManyToOne(() => Contenedor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contenedorId' })
  contenedor?: Contenedor;

  /** A cuanto del contenedor estaba el auto. */
  @Column({ type: 'numeric', precision: 7, scale: 1, transformer: columnaNumerica })
  distanciaMetros!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn!: Date;

  @Column({ type: 'timestamptz' })
  venceEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resueltaEn!: Date | null;
}
