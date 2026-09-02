import { TipoResiduo } from '../../../shared/domain/enums';

export interface BusquedaCercanos {
  lat: number;
  lng: number;
  radioMetros: number;
  tipoResiduo?: TipoResiduo;
}

/**
 * Fila cruda de la consulta geoespacial. La distancia la calcula el motor de
 * base de datos junto con el filtro de radio: recalcularla en otra capa duplica
 * la formula, y dos implementaciones pueden discrepar justo en el borde.
 */
export interface ContenedorCercano {
  id: string;
  codigo: string;
  lat: number;
  lng: number;
  tipoResiduo: TipoResiduo;
  distanciaMetros: number;
}

export interface ContenedorCercanoRepository {
  buscarCercanos(busqueda: BusquedaCercanos): Promise<ContenedorCercano[]>;
}

export const CONTENEDOR_CERCANO_REPOSITORY = Symbol('CONTENEDOR_CERCANO_REPOSITORY');
