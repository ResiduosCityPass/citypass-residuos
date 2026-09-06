import { Chofer } from './chofer.entity';

export interface FiltroChoferes {
  soloActivos?: boolean;
}

export interface ChoferRepository {
  crear(chofer: Partial<Chofer>): Promise<Chofer>;
  guardar(chofer: Chofer): Promise<Chofer>;
  buscarPorId(id: string): Promise<Chofer | null>;
  buscarPorLegajo(legajo: string): Promise<Chofer | null>;
  /**
   * Resuelve el chofer ACTIVO que corresponde a una sesion (CU-10).
   *
   * Filtra por `activo` a proposito, y por eso el nombre lo dice: es lo unico
   * que revoca el acceso de un chofer. Sin login no hay sesion que cerrar ni
   * contrasena que cambiar; dar de baja al chofer es el mecanismo, y solo
   * funciona si esta consulta lo respeta.
   */
  buscarActivoPorUsuarioSub(sub: string): Promise<Chofer | null>;
  listar(filtro: FiltroChoferes): Promise<Chofer[]>;
}

export const CHOFER_REPOSITORY = Symbol('CHOFER_REPOSITORY');
