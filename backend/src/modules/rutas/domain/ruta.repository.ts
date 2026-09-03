import { EstadoRuta } from '../../../shared/domain/enums';
import { Ruta } from './ruta.entity';

/** Estados en los que una ruta todavia ocupa sus contenedores y su camion. */
export const ESTADOS_VIVOS: EstadoRuta[] = [
  EstadoRuta.PROPUESTA,
  EstadoRuta.ASIGNADA,
  EstadoRuta.EN_CURSO,
];

/**
 * Cuantas paradas de la ruta ya se resolvieron. Va en el listado (CU-08) para
 * que la tabla pueda mostrar "2 de 3 vaciadas" sin una llamada por fila.
 */
export interface AvanceParadas {
  total: number;
  confirmadas: number;
  omitidas: number;
  pendientes: number;
}

export const AVANCE_VACIO: AvanceParadas = {
  total: 0,
  confirmadas: 0,
  omitidas: 0,
  pendientes: 0,
};

export interface FiltroRutas {
  estado?: EstadoRuta;
  camionId?: string;
}

export interface RutaRepository {
  crear(ruta: Partial<Ruta>): Promise<Ruta>;
  guardar(ruta: Ruta): Promise<Ruta>;
  /** Con camion y paradas (con su contenedor) cargados. */
  buscarPorId(id: string): Promise<Ruta | null>;
  listar(filtro: FiltroRutas): Promise<Ruta[]>;
  /** Ruta activa del chofer: ASIGNADA o EN_CURSO. */
  buscarActivaDeChofer(choferId: string): Promise<Ruta | null>;
  /** Contenedores comprometidos en alguna ruta viva. */
  contenedoresEnRutasVivas(): Promise<string[]>;
  /** Avance de varias rutas en una sola consulta agrupada, sin N+1. */
  avanceDeParadas(rutaIds: string[]): Promise<Map<string, AvanceParadas>>;
}

export const RUTA_REPOSITORY = Symbol('RUTA_REPOSITORY');
