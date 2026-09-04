import { Chofer } from './chofer.entity';

export interface FiltroChoferes {
  soloActivos?: boolean;
}

export interface ChoferRepository {
  crear(chofer: Partial<Chofer>): Promise<Chofer>;
  guardar(chofer: Chofer): Promise<Chofer>;
  buscarPorId(id: string): Promise<Chofer | null>;
  buscarPorLegajo(legajo: string): Promise<Chofer | null>;
  /** Resuelve el chofer a partir del `sub` del token (CU-10). */
  buscarPorUsuarioSub(sub: string): Promise<Chofer | null>;
  listar(filtro: FiltroChoferes): Promise<Chofer[]>;
}

export const CHOFER_REPOSITORY = Symbol('CHOFER_REPOSITORY');
