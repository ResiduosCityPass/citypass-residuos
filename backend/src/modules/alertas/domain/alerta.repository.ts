import { EstadoAlerta, Severidad, TipoAlerta } from '../../../shared/domain/enums';
import { Alerta } from './alerta.entity';

export interface FiltroAlertas {
  contenedorId?: string;
  tipo?: TipoAlerta;
  severidad?: Severidad;
  estado?: EstadoAlerta;
}

export interface AlertaRepository {
  crear(alerta: Partial<Alerta>): Promise<Alerta>;
  guardar(alerta: Alerta): Promise<Alerta>;
  buscarPorId(id: string): Promise<Alerta | null>;
  buscarAbierta(contenedorId: string, tipo: TipoAlerta): Promise<Alerta | null>;
  listar(filtro: FiltroAlertas): Promise<Alerta[]>;
  listarAbiertasPorContenedor(contenedorId: string, tipo: TipoAlerta): Promise<Alerta[]>;
}

export const ALERTA_REPOSITORY = Symbol('ALERTA_REPOSITORY');
