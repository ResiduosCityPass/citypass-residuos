import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EstadoSensor } from '../../../shared/domain/enums';
import { Contenedor } from './contenedor.entity';

/**
 * Sensor IoT instalado dentro de un contenedor (CU-01).
 *
 * Es entidad aparte aunque la relacion sea 1:1: tiene ciclo de vida propio (se
 * rompe, se reemplaza, se recalibra) y guarda `apiKeyHash`, que es una credencial
 * y no debe convivir con datos de ubicacion publica (ADR-005).
 */
@Entity('sensor')
export class Sensor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Identificador legible, del estilo SN-0421. */
  @Column({ unique: true, length: 20 })
  codigo!: string;

  @Column({ type: 'uuid', unique: true })
  contenedorId!: string;

  @OneToOne(() => Contenedor, (contenedor) => contenedor.sensor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contenedorId' })
  contenedor?: Contenedor;

  /**
   * Hash de la API key con la que el sensor autentica `POST /lecturas`.
   * La key en claro se muestra una unica vez, al vincular el sensor.
   */
  @Index({ unique: true })
  @Column({ length: 120, select: false })
  apiKeyHash!: string;

  @Column({ type: 'enum', enum: EstadoSensor, default: EstadoSensor.ACTIVO })
  estado!: EstadoSensor;

  @Column({ type: 'int', nullable: true })
  bateriaPct!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  ultimoReporteEn!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn!: Date;
}
