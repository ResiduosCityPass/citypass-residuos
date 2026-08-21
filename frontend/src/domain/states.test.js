import { describe, it, expect } from 'vitest';
import { colorForState, COLOR_BY_STATE, neverReported, timeAgo } from './states.js';

describe('vocabulario del dominio', () => {
  it('da un color por cada estado del enum del backend', () => {
    expect(colorForState('NORMAL')).toBe(COLOR_BY_STATE.NORMAL);
    expect(colorForState('CRITICO')).toBe(COLOR_BY_STATE.CRITICO);
  });

  it('cae en gris ante un estado desconocido en vez de romper el mapa', () => {
    expect(colorForState('ALGO_NUEVO')).toBe(COLOR_BY_STATE.FUERA_DE_SERVICIO);
  });

  it('distingue un contenedor sin lecturas de uno realmente vacio', () => {
    // Sin sensor: se queda en NORMAL con nivel 0 y ultimaLecturaEn null para siempre.
    expect(neverReported({ nivelLlenadoPct: 0, ultimaLecturaEn: null })).toBe(true);
    // Con sensor y vacio de verdad: reporto, y el nivel dio 0.
    expect(neverReported({ nivelLlenadoPct: 0, ultimaLecturaEn: '2026-08-20T22:50:02.199Z' })).toBe(false);
  });

  it('formatea el tiempo transcurrido y tolera el null', () => {
    expect(timeAgo(null)).toBe('—');
    expect(timeAgo(new Date(Date.now() - 5_000).toISOString())).toBe('hace instantes');
    expect(timeAgo(new Date(Date.now() - 3 * 60_000).toISOString())).toBe('hace 3 min');
    expect(timeAgo(new Date(Date.now() - 5 * 3_600_000).toISOString())).toBe('hace 5 h');
  });
});
