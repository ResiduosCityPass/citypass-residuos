import { ActividadMasiva } from './actividad-masiva.entity';
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

  guardarActividad(actividad: Partial<ActividadMasiva>): Promise<ActividadMasiva>;
  /** Actividades que terminan despues de `desde`, ordenadas por hora de fin. */
  actividadesQueTerminanDespuesDe(desde: Date): Promise<ActividadMasiva[]>;
}

/** Lo que necesita el ruteo de CU-08: los refuerzos vigentes en un momento. */
export interface RefuerzosVigentes {
  vigentes(momento: Date): Promise<RefuerzoEvento[]>;
}

export const INTEGRACION_REPOSITORY = Symbol('INTEGRACION_REPOSITORY');
export const REFUERZOS_VIGENTES = Symbol('REFUERZOS_VIGENTES');
