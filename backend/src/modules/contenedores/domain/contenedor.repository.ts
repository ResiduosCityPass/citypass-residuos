import { EstadoContenedor, TipoResiduo } from '../../../shared/domain/enums';
import { Contenedor } from './contenedor.entity';

export interface FiltroContenedores {
  zonaId?: string;
  tipoResiduo?: TipoResiduo;
  estado?: EstadoContenedor;
  soloActivos?: boolean;
}

export interface ContenedorRepository {
  crear(contenedor: Partial<Contenedor>): Promise<Contenedor>;
  guardar(contenedor: Contenedor): Promise<Contenedor>;
  buscarPorId(id: string): Promise<Contenedor | null>;
  buscarPorCodigo(codigo: string): Promise<Contenedor | null>;
  listar(filtro: FiltroContenedores): Promise<Contenedor[]>;
  /** Igual que `listar`, con la zona cargada. Lo usa el mapa (CU-07). */
  listarConZona(filtro: FiltroContenedores): Promise<Contenedor[]>;
  contar(): Promise<number>;
}

export const CONTENEDOR_REPOSITORY = Symbol('CONTENEDOR_REPOSITORY');
