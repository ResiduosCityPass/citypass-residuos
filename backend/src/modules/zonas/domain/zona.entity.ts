import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import type { RestriccionInundacion } from '../../contingencias/domain/contingencia.repository';

/**
 * Zona de la ciudad (CU-02).
 *
 * Alcance recortado segun ADR-004: la zona es una entidad con umbrales, no un
 * poligono dibujado sobre el mapa. La regla de negocio que consume CU-05 es
 * identica; el poligono era presentacion, no dominio.
 */
@Entity('zona')
export class Zona {
  /** Independientes del bloqueo manual persistido en `bloqueada`. */
  restriccionesInundacion?: RestriccionInundacion[];
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
   * Bloqueo manual. Las causas por inundacion se guardan por separado:
   * finalizar una contingencia nunca modifica esta columna.
   */
  @Column({ default: false })
  bloqueada!: boolean;

  @OneToMany(() => Contenedor, (contenedor) => contenedor.zona)
  contenedores?: Contenedor[];

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadaEn!: Date;
}
