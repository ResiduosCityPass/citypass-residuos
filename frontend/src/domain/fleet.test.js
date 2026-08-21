import { describe, it, expect } from 'vitest';
import { isTruckAvailable, canAssign } from './states.js';

describe('CU-03 · disponibilidad de un camion', () => {
  it('solo un camion DISPONIBLE puede recibir una ruta nueva', () => {
    expect(isTruckAvailable({ estado: 'DISPONIBLE' })).toBe(true);
    expect(isTruckAvailable({ estado: 'EN_RUTA' })).toBe(false);
    expect(isTruckAvailable({ estado: 'MANTENIMIENTO' })).toBe(false);
  });
});

describe('CU-09 · cuando se puede asignar una ruta', () => {
  /**
   * La separacion entre generar y asignar es deliberada: mantiene a una persona
   * en el medio por si la heuristica propone algo absurdo. Solo una PROPUESTA
   * esta esperando esa decision.
   */
  it('solo desde PROPUESTA', () => {
    expect(canAssign({ estado: 'PROPUESTA' })).toBe(true);
    expect(canAssign({ estado: 'ASIGNADA' })).toBe(false);
    expect(canAssign({ estado: 'EN_CURSO' })).toBe(false);
    expect(canAssign({ estado: 'COMPLETADA' })).toBe(false);
    expect(canAssign({ estado: 'CANCELADA' })).toBe(false);
  });
});
