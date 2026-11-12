// Una finalización necesita atención hasta que el operador habilite la recuperación.
export const climateAlertNeedsAttention = (alert) =>
  alert.decision === 'PENDIENTE_REVISION' || alert.estadoContingencia === 'PENDIENTE_RECUPERACION';

export const climateAlertIsCurrent = (alert) =>
  climateAlertNeedsAttention(alert) || Boolean(alert.contingenciaId && alert.estadoContingencia !== 'RECUPERADA');
