import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoAlerta, Severidad, TipoAlerta } from '../../../shared/domain/enums';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';

/**
 * Alerta sobre un contenedor (CU-05, CU-06).
 *
 * Es entidad aparte de Contenedor porque un mismo contenedor puede tener varias
 * alertas simultaneas de distinto tipo (saturado y con bateria baja a la vez), y
 * cada una necesita su ciclo de vida propio para el tablero del operador.
 */
@Entity('alerta')
@Index(['contenedorId', 'tipo', 'estado'])
export class Alerta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  contenedorId!: string;

  @ManyToOne(() => Contenedor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contenedorId' })
  contenedor?: Contenedor;

  @Column({ type: 'enum', enum: TipoAlerta })
  tipo!: TipoAlerta;

  @Column({ type: 'enum', enum: Severidad })
  severidad!: Severidad;

  @Column({ type: 'enum', enum: EstadoAlerta, default: EstadoAlerta.ABIERTA })
  estado!: EstadoAlerta;

  /** Texto legible para el operador: que se midio y contra que umbral. */
  @Column({ type: 'text', nullable: true })
  detalle!: string | null;

  @Column({ type: 'timestamptz' })
  detectadaEn!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resueltaEn!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn!: Date;
}
