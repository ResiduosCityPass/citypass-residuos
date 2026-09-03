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
 * Lectura reportada por un sensor (CU-04). Es el disparador de todo el dominio.
 *
 * La tabla es append-only: nunca se actualiza ni se borra. Es la fuente de verdad
 * historica y el insumo del modelo predictivo de CU-12.
 *
 * El indice compuesto sirve a los dos accesos calientes:
 *   - "ultima lectura de este contenedor"      (CU-05, CU-07)
 *   - "ultimas N lecturas de este contenedor"  (CU-12)
 */
@Entity('lectura')
@Index('idx_lectura_contenedor_fecha', ['contenedorId', 'registradaEn'])
export class Lectura {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  contenedorId!: string;

  @ManyToOne(() => Contenedor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contenedorId' })
  contenedor?: Contenedor;

  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: columnaNumerica })
  nivelLlenadoPct!: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: columnaNumerica })
  temperaturaC!: number;

  @Column({ type: 'int' })
  bateriaPct!: number;

  /** Momento en que el sensor tomo la medicion, no en que la recibimos. */
  @Column({ type: 'timestamptz' })
  registradaEn!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  recibidaEn!: Date;
}
