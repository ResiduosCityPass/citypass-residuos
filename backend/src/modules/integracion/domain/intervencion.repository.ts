import { Intervencion } from './intervencion.entity';

export interface IntervencionRepository {
  /** Guarda la intervencion. `null` si ya habia una para esa emergencia. */
  crearSiNoExiste(intervencion: Partial<Intervencion>): Promise<Intervencion | null>;
  listar(): Promise<Intervencion[]>;
  buscar(id: string): Promise<Intervencion | null>;
  guardar(intervencion: Intervencion): Promise<Intervencion>;
}

export const INTERVENCION_REPOSITORY = Symbol('INTERVENCION_REPOSITORY');
