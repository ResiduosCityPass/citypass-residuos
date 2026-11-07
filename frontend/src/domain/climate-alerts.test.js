import { describe, it, expect } from 'vitest';
import { climateAlertIsCurrent, climateAlertNeedsAttention } from './climate-alerts.js';
describe('atención de alertas climáticas', () => {
  it.each([
    [{ decision: 'PENDIENTE_REVISION' }, true, true],
    [{ decision: 'SUSPENDER', contingenciaId: 'c', estadoContingencia: 'ACTIVA' }, false, true],
    [{ decision: 'SUSPENDER', contingenciaId: 'c', estadoContingencia: 'PENDIENTE_RECUPERACION' }, true, true],
    [{ decision: 'SUSPENDER', contingenciaId: 'c', estadoContingencia: 'EN_RECUPERACION' }, false, true],
    [{ decision: 'SUSPENDER', contingenciaId: 'c', estadoContingencia: 'RECUPERADA' }, false, false],
    [{ decision: 'SIN_AFECTACION' }, false, false],
  ])('refleja el estado operativo %j', (alert, attention, current) => {
    expect(climateAlertNeedsAttention(alert)).toBe(attention);
    expect(climateAlertIsCurrent(alert)).toBe(current);
  });
});
