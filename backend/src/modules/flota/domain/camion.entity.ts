import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EstadoCamion, TipoResiduo } from '../../../shared/domain/enums';

/**
 * Camion recolector (CU-03).
 *
 * El planificador de rutas necesita saber con que recursos cuenta: cuanto
 * levanta cada camion y que tipo de residuo puede transportar.
 */
@Entity('camion')
@Index(['estado', 'tipoResiduoHabilitado'])
export class Camion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Normalizada en mayusculas y sin espacios al guardar. */
  @Column({ unique: true, length: 20 })
  patente!: string;

  @Column({ type: 'int' })
  capacidadLitros!: number;

  /**
   * No es decorativo: decide que contenedores puede levantar este camion cuando
   * CU-08 arma una ruta.
   */
  @Column({ type: 'enum', enum: TipoResiduo })
  tipoResiduoHabilitado!: TipoResiduo;

  @Column({ type: 'enum', enum: EstadoCamion, default: EstadoCamion.DISPONIBLE })
  estado!: EstadoCamion;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn!: Date;
}
