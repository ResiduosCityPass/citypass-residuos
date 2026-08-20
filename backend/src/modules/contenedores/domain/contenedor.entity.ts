import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EstadoContenedor, TipoResiduo } from '../../../shared/domain/enums';
import { columnaNumerica } from '../../../shared/persistence/columna-numerica';
import { Zona } from '../../zonas/domain/zona.entity';
import { Sensor } from './sensor.entity';

/**
 * Contenedor urbano (CU-01). Agregado central del modulo.
 *
 * Los campos `estado`, `nivelLlenadoPct` y `temperaturaC` desnormalizan la ultima
 * lectura a proposito: el mapa de CU-07 tiene que responder sin JOIN contra una
 * tabla que crece ~48.000 filas por dia. Ademas CU-05 necesita el estado
 * *anterior* para no re-emitir el evento si el contenedor ya estaba critico.
 */
@Entity('contenedor')
@Index(['zonaId', 'estado'])
export class Contenedor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Identificador legible para operacion y demo, del estilo CT-0421. */
  @Column({ unique: true, length: 20 })
  codigo!: string;

  @Column({ type: 'uuid' })
  zonaId!: string;

  @ManyToOne(() => Zona, (zona) => zona.contenedores, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'zonaId' })
  zona?: Zona;

  @Column({ type: 'enum', enum: TipoResiduo })
  tipoResiduo!: TipoResiduo;

  @Column({ type: 'int' })
  capacidadLitros!: number;

  @Column({ type: 'numeric', precision: 10, scale: 7, transformer: columnaNumerica })
  lat!: number;

  @Column({ type: 'numeric', precision: 10, scale: 7, transformer: columnaNumerica })
  lng!: number;

  @Column({ type: 'enum', enum: EstadoContenedor, default: EstadoContenedor.NORMAL })
  estado!: EstadoContenedor;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: columnaNumerica,
  })
  nivelLlenadoPct!: number;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: columnaNumerica,
  })
  temperaturaC!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  ultimaLecturaEn!: Date | null;

  /** Baja logica: nunca se borra un contenedor con historico de lecturas asociado. */
  @Column({ default: true })
  activo!: boolean;

  @OneToOne(() => Sensor, (sensor) => sensor.contenedor)
  sensor?: Sensor;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn!: Date;
}
