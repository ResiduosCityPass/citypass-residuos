import { EstadoCamion, TipoResiduo } from '../../../shared/domain/enums';
import { Camion } from './camion.entity';

export interface FiltroCamiones {
  estado?: EstadoCamion;
  tipoResiduoHabilitado?: TipoResiduo;
}

export interface CamionRepository {
  crear(camion: Partial<Camion>): Promise<Camion>;
  guardar(camion: Camion): Promise<Camion>;
  buscarPorId(id: string): Promise<Camion | null>;
  buscarPorPatente(patente: string): Promise<Camion | null>;
  listar(filtro: FiltroCamiones): Promise<Camion[]>;
}

export const CAMION_REPOSITORY = Symbol('CAMION_REPOSITORY');
