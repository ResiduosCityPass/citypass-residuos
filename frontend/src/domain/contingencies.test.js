import { describe, expect, it } from 'vitest';
import { isStopSuspended, isZoneRestricted, pendingRecoveryCount } from './contingencies.js';
import { canConfirmStop, canSkipStop } from './states.js';

describe('Restricciones por inundacion', () => {
  it('una parada pendiente suspendida no puede confirmarse ni omitirse', () => {
    const stop = { estado: 'PENDIENTE', restriccionesInundacion: [{ contingenciaId: 'f1' }] };
    expect(isStopSuspended(stop)).toBe(true);
    expect(canConfirmStop(stop)).toBe(false); expect(canSkipStop(stop)).toBe(false);
    expect(isStopSuspended({ ...stop, estado: 'CONFIRMADA' })).toBe(false);
    expect(isStopSuspended(null)).toBe(false);
  });
  it('quitar un bloqueo manual conserva las restricciones de inundacion', () => {
    expect(isZoneRestricted({ bloqueada: false, restriccionesInundacion: [{}] })).toBe(true);
    expect(isZoneRestricted({ bloqueada: true })).toBe(true);
    expect(isZoneRestricted({ bloqueada: false })).toBe(false);
  });
  it('cuenta solo los contenedores cuyo vaciado no fue confirmado', () => {
    expect(pendingRecoveryCount({ contenedores: [{ vaciadoEn: null }, { vaciadoEn: '2026-10-19' }] })).toBe(1);
    expect(pendingRecoveryCount({})).toBe(0);
  });
});
