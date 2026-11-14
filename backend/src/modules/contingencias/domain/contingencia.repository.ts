import { Contingencia, EstadoContingencia } from './contingencia.entity';

export interface RestriccionInundacion {
  zonaId: string;
  contingenciaId: string;
  descripcion: string;
  estado: EstadoContingencia;
}

export interface ParadaAfectable {
  id: string;
  rutaId: string;
  zonaId: string;
}

/** Una parada pendiente con una cuadrilla ya comprometida (no una propuesta). */
export interface ParadaClimaticaAsignada {
  id: string;
  camionId: string;
}

export interface ContingenciaRepository {
  /** Lock transaccional compartido con generar/asignar/confirmar/omitir. */
  bloquearOperacion(): Promise<void>;
  buscar(id: string): Promise<Contingencia | null>;
  listar(): Promise<Contingencia[]>;
  guardar(contingencia: Partial<Contingencia>): Promise<Contingencia>;
  registrarZonas(id: string, zonaIds: string[]): Promise<void>;
  registrarImpactos(id: string, zonaIds: string[]): Promise<void>;
  zonasExistentes(zonaIds: string[]): Promise<number>;
  zonaTieneHistorial(zonaId: string): Promise<boolean>;
  eventoProcesado(eventId: string): Promise<{ huella: string } | null>;
  registrarEvento(eventId: string, huella: string): Promise<void>;
  restricciones(): Promise<RestriccionInundacion[]>;
  zonasBloqueadasManualmente(): Promise<string[]>;
  pendientesDeRecuperacion(): Promise<string[]>;
  marcarVaciado(contenedorId: string, fecha: Date): Promise<string[]>;
  contarPendientes(id: string): Promise<number>;
  paradasAsignadasEnZonas(zonaIds: string[]): Promise<ParadaClimaticaAsignada[]>;
  paradasPendientes(rutaIds: string[]): Promise<ParadaAfectable[]>;
}

export const CONTINGENCIA_REPOSITORY = Symbol('CONTINGENCIA_REPOSITORY');
