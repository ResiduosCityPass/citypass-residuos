import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Chofer que ejecuta las rutas de recoleccion (CU-09, CU-10).
 *
 * Es una entidad de este modulo. Durante los primeros sprints se asumio que los
 * choferes eran usuarios del modulo de identidad del Squad 2 y que mantener una
 * copia aca solo iba a desincronizarse; por eso `Ruta.choferId` era texto libre
 * y el operador escribia el identificador a mano. Ese supuesto cambio: los
 * choferes son nuestros, no se registran ni inician sesion contra el Squad 2.
 *
 * Sin esta tabla, un identificador mal tipeado asignaba la ruta igual, con
 * exito, y el chofer no la veia nunca: su pantalla quedaba vacia y sin ningun
 * error. Fallaba en silencio, que es la peor forma de fallar.
 */
@Entity('chofer')
export class Chofer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 120 })
  nombre!: string;

  /**
   * Legajo o documento con el que se lo identifica en la operacion. Es lo que
   * distingue a dos choferes que se llaman igual.
   */
  @Column({ unique: true, length: 40 })
  legajo!: string;

  /**
   * `sub` del token con el que este chofer entra a la pantalla de CU-10.
   *
   * Es lo unico que une a la persona con su sesion: `GET /rutas/mias` resuelve
   * el chofer buscando por aca. Es nullable porque un chofer puede estar dado de
   * alta en la operacion antes de que alguien le configure el acceso, y en ese
   * caso igual se le pueden asignar rutas.
   */
  @Index({ unique: true, where: '"usuarioSub" IS NOT NULL' })
  @Column({ type: 'varchar', length: 120, nullable: true })
  usuarioSub!: string | null;

  /** Baja logica: un chofer borrado seguiria colgando de sus rutas historicas. */
  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn!: Date;
}
