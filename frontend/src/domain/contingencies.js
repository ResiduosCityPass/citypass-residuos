export const FLOOD_STATE_LABEL = {
  ACTIVA: 'Evento climático activo',
  PENDIENTE_RECUPERACION: 'Pendiente de habilitación',
  EN_RECUPERACION: 'En recuperación',
  RECUPERADA: 'Servicio recuperado',
};

export const FLOOD_STATE_CHIP = {
  ACTIVA: 'danger', PENDIENTE_RECUPERACION: 'warning',
  EN_RECUPERACION: 'info', RECUPERADA: 'success',
};

export const isStopSuspended = (stop) =>
  stop?.estado === 'PENDIENTE' && (stop.restriccionesInundacion?.length ?? 0) > 0;

export const isZoneRestricted = (zone) =>
  Boolean(zone.bloqueada || zone.restriccionesInundacion?.length);

export const pendingRecoveryCount = (flood) =>
  (flood.contenedores ?? []).filter((c) => !c.vaciadoEn).length;
