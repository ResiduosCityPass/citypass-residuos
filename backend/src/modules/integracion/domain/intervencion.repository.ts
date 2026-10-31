import { Intervencion } from './intervencion.entity';

export interface IntervencionRepository {
  /** Guarda la intervencion. `null` si ya habia una para esa emergencia. */
  crearSiNoExiste(intervencion: Partial<Intervencion>): Promise<Intervencion | null>;
  listar(): Promise<Intervencion[]>;
  buscar(id: string): Promise<Intervencion | null>;
  /**
   * Pasa a COMPLETADA solo si sigue PROGRAMADA, en una sola sentencia. `false` si
   * otro operador se adelanto: dos completar a la vez no pueden publicar dos eventos.
   */
  completarSiProgramada(id: string, completadaEn: Date): Promise<boolean>;
}

export const INTERVENCION_REPOSITORY = Symbol('INTERVENCION_REPOSITORY');
