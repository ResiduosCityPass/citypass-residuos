import { BloqueoPorIncidente } from './bloqueo-por-incidente.entity';
import { ObstruccionPorReclamo } from './obstruccion-por-reclamo.entity';
import { RefuerzoEvento } from './refuerzo-evento.entity';

export interface IntegracionRepository {
  /** Registra el evento entrante. false si ya se habia recibido. */
  registrarEvento(eventId: string, eventType: string): Promise<boolean>;

  guardarRefuerzo(refuerzo: Partial<RefuerzoEvento>): Promise<RefuerzoEvento>;
  borrarRefuerzo(eventoId: string): Promise<void>;

  guardarBloqueo(bloqueo: Partial<BloqueoPorIncidente>): Promise<BloqueoPorIncidente>;
  buscarBloqueo(emergenciaId: string): Promise<BloqueoPorIncidente | null>;
  bloqueosActivos(): Promise<BloqueoPorIncidente[]>;
}

/** Lo que necesita el ruteo de CU-08: los refuerzos vigentes en un momento. */
export interface RefuerzosVigentes {
  vigentes(momento: Date): Promise<RefuerzoEvento[]>;
}

/** Contenedores tapados por autos denunciados en reclamos (CU-INT-02). */
export interface ObstruccionRepository {
  /** Si el reclamo ya tapaba ese contenedor, la fila existente queda como estaba. */
  guardarObstrucciones(filas: Partial<ObstruccionPorReclamo>[]): Promise<void>;

  /** Marca resueltas las obstrucciones abiertas del reclamo. Devuelve cuantas cerro. */
  resolverReclamo(reclamoId: string, momento: Date): Promise<number>;

  /** Ids de los contenedores con una obstruccion sin resolver y sin vencer en ese momento. */
  contenedoresObstruidos(momento: Date): Promise<string[]>;
}

export const INTEGRACION_REPOSITORY = Symbol('INTEGRACION_REPOSITORY');
export const OBSTRUCCION_REPOSITORY = Symbol('OBSTRUCCION_REPOSITORY');
export const REFUERZOS_VIGENTES = Symbol('REFUERZOS_VIGENTES');
