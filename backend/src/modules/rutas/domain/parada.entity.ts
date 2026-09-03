import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoParada } from '../../../shared/domain/enums';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { Ruta } from './ruta.entity';

/** Una visita a un contenedor dentro de una ruta (CU-08, CU-10). */
@Entity('parada')
@Index(['rutaId', 'orden'])
export class Parada {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  rutaId!: string;

  @ManyToOne(() => Ruta, (ruta) => ruta.paradas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rutaId' })
  ruta?: Ruta;

  @Column({ type: 'uuid' })
  contenedorId!: string;

  @ManyToOne(() => Contenedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contenedorId' })
  contenedor?: Contenedor;

  /** Posicion en el recorrido, empezando en 1. */
  @Column({ type: 'int' })
  orden!: number;

  @Column({ type: 'enum', enum: EstadoParada, default: EstadoParada.PENDIENTE })
  estado!: EstadoParada;

  @Column({ type: 'timestamptz', nullable: true })
  confirmadaEn!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  omitidaEn!: Date | null;

  /**
   * Por que el chofer no pudo vaciar este contenedor. Es obligatorio al omitir:
   * una parada OMITIDA sin motivo no le dice nada al operador que despues tiene
   * que decidir si manda otro camion.
   */
  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo!: string | null;
}
