import { EstadoAlerta, Severidad, TipoAlerta } from '../../../shared/domain/enums';
import { Alerta } from './alerta.entity';

/**
 * Una alerta que alguien esta atendiendo sigue sin resolver: el contenedor sigue
 * lleno, o sigue caliente. Tratar solo ABIERTA como "viva" hacia que atender un
 * incendio con el contenedor todavia caliente creara otra alerta y otro evento
 * para Emergencias en la lectura siguiente, y que una saturacion atendida no se
 * cerrara nunca al vaciar el contenedor.
 */
export const ESTADOS_SIN_RESOLVER: EstadoAlerta[] = [
  EstadoAlerta.ABIERTA,
  EstadoAlerta.EN_ATENCION,
];

export interface FiltroAlertas {
  contenedorId?: string;
  tipo?: TipoAlerta;
  severidad?: Severidad;
  estado?: EstadoAlerta | EstadoAlerta[];
}

export interface AlertaRepository {
  crear(alerta: Partial<Alerta>): Promise<Alerta>;
  guardar(alerta: Alerta): Promise<Alerta>;
  buscarPorId(id: string): Promise<Alerta | null>;
  /** Abierta o en atencion: ver `ESTADOS_SIN_RESOLVER`. */
  buscarAbierta(contenedorId: string, tipo: TipoAlerta): Promise<Alerta | null>;
  /** Trae la relacion `contenedor` cargada: el listado expone su codigo. */
  listar(filtro: FiltroAlertas): Promise<Alerta[]>;
  /** Abiertas o en atencion: ver `ESTADOS_SIN_RESOLVER`. */
  listarAbiertasPorContenedor(contenedorId: string, tipo: TipoAlerta): Promise<Alerta[]>;
}

export const ALERTA_REPOSITORY = Symbol('ALERTA_REPOSITORY');
