import { EstadoRuta } from '../../../shared/domain/enums';
import { Ruta } from './ruta.entity';

/** Estados en los que una ruta todavia ocupa sus contenedores y su camion. */
export const ESTADOS_VIVOS: EstadoRuta[] = [
  EstadoRuta.PROPUESTA,
  EstadoRuta.ASIGNADA,
  EstadoRuta.EN_CURSO,
];

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
}

export const RUTA_REPOSITORY = Symbol('RUTA_REPOSITORY');
