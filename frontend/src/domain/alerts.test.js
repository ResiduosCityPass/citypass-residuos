import { describe, it, expect } from 'vitest';
import { canAcknowledge, canResolve, isActiveFire } from './states.js';

/**
 * La maquina de estados de una alerta es ABIERTA -> EN_ATENCION -> RESUELTA.
 * No se puede saltear ni volver atras, y la UI deshabilita los botones en vez
 * de dejar que el usuario se coma un 409.
 */
describe('maquina de estados de las alertas', () => {
  it('solo se puede atender una alerta ABIERTA', () => {
    expect(canAcknowledge({ estado: 'ABIERTA' })).toBe(true);
    expect(canAcknowledge({ estado: 'EN_ATENCION' })).toBe(false);
    expect(canAcknowledge({ estado: 'RESUELTA' })).toBe(false);
  });

  it('se puede resolver desde ABIERTA o EN_ATENCION, pero no dos veces', () => {
    expect(canResolve({ estado: 'ABIERTA' })).toBe(true);
    expect(canResolve({ estado: 'EN_ATENCION' })).toBe(true);
    expect(canResolve({ estado: 'RESUELTA' })).toBe(false);
  });
});

describe('incendio activo', () => {
  it('cuenta cualquier incendio que todavia no este resuelto', () => {
    expect(isActiveFire({ tipo: 'INCENDIO', estado: 'ABIERTA' })).toBe(true);
    expect(isActiveFire({ tipo: 'INCENDIO', estado: 'EN_ATENCION' })).toBe(true);
    expect(isActiveFire({ tipo: 'INCENDIO', estado: 'RESUELTA' })).toBe(false);
  });

  it('no confunde una saturacion abierta con un incendio', () => {
    expect(isActiveFire({ tipo: 'SATURACION', estado: 'ABIERTA' })).toBe(false);
  });
});
