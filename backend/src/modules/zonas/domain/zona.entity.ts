import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';

/**
 * Zona de la ciudad (CU-02).
 *
 * Alcance recortado segun ADR-004: la zona es una entidad con umbrales, no un
 * poligono dibujado sobre el mapa. La regla de negocio que consume CU-05 es
 * identica; el poligono era presentacion, no dominio.
 */
@Entity('zona')
export class Zona {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 80 })
  nombre!: string;

  /** Porcentaje de llenado a partir del cual el contenedor se considera critico. */
  @Column({ type: 'int' })
  umbralCriticoPct!: number;

  /** Temperatura interna que dispara la alerta de incendio (CU-06). */
  @Column({ type: 'int' })
  umbralTemperaturaC!: number;

  /**
   * Los contenedores de una zona bloqueada quedan excluidos del ruteo de CU-08.
   * Es el estado efectivo: la bloquea un operador a mano o una emergencia que
   * corta la circulacion (CU-INT-01).
   */
  @Column({ default: false })
  bloqueada!: boolean;

  /**
   * Un operador la bloqueo a mano. Se guarda aparte de `bloqueada` para que el
   * fin de una emergencia no levante un bloqueo que pidio una persona.
   */
  @Column({ default: false })
  bloqueoManual!: boolean;

  @OneToMany(() => Contenedor, (contenedor) => contenedor.zona)
  contenedores?: Contenedor[];

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadaEn!: Date;
}
