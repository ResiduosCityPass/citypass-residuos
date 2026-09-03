import { Lectura } from './lectura.entity';

export interface LecturaRepository {
  crear(lectura: Partial<Lectura>): Promise<Lectura>;
  ultimaDe(contenedorId: string): Promise<Lectura | null>;
  /** Ultimas N lecturas, de la mas reciente a la mas vieja. Insumo de CU-12. */
  ultimasDe(contenedorId: string, cantidad: number): Promise<Lectura[]>;
}

export const LECTURA_REPOSITORY = Symbol('LECTURA_REPOSITORY');
