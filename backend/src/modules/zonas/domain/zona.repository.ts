import { Zona } from './zona.entity';

/**
 * Puerto de persistencia de Zona (ADR-002).
 *
 * La capa de aplicacion depende de esta interfaz, nunca del Repository de TypeORM.
 * Es lo que permite que los tests unitarios pasen un doble en lugar de levantar
 * Postgres.
 */
export interface ZonaRepository {
  crear(zona: Partial<Zona>): Promise<Zona>;
  guardar(zona: Zona): Promise<Zona>;
  buscarPorId(id: string): Promise<Zona | null>;
  buscarPorNombre(nombre: string): Promise<Zona | null>;
  listar(): Promise<Zona[]>;
  contarContenedores(zonaId: string): Promise<number>;
  eliminar(id: string): Promise<void>;
}

export const ZONA_REPOSITORY = Symbol('ZONA_REPOSITORY');
