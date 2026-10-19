import { BloqueoPorIncidente } from './bloqueo-por-incidente.entity';
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

export const INTEGRACION_REPOSITORY = Symbol('INTEGRACION_REPOSITORY');
export const REFUERZOS_VIGENTES = Symbol('REFUERZOS_VIGENTES');
