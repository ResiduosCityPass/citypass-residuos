import { describe, it, expect } from 'vitest';
import { colorDeEstado, COLOR_POR_ESTADO, nuncaReporto, haceCuanto } from './estados.js';

describe('vocabulario del dominio', () => {
  it('da un color por cada estado del enum del backend', () => {
    expect(colorDeEstado('NORMAL')).toBe(COLOR_POR_ESTADO.NORMAL);
    expect(colorDeEstado('CRITICO')).toBe(COLOR_POR_ESTADO.CRITICO);
  });

  it('cae en gris ante un estado desconocido en vez de romper el mapa', () => {
    expect(colorDeEstado('ALGO_NUEVO')).toBe(COLOR_POR_ESTADO.FUERA_DE_SERVICIO);
  });

  it('distingue un contenedor sin lecturas de uno realmente vacio', () => {
    // Sin sensor: se queda en NORMAL con nivel 0 y ultimaLecturaEn null para siempre.
    expect(nuncaReporto({ nivelLlenadoPct: 0, ultimaLecturaEn: null })).toBe(true);
    // Con sensor y vacio de verdad: reporto, y el nivel dio 0.
    expect(nuncaReporto({ nivelLlenadoPct: 0, ultimaLecturaEn: '2026-08-20T22:50:02.199Z' })).toBe(false);
  });

  it('formatea el tiempo transcurrido y tolera el null', () => {
    expect(haceCuanto(null)).toBe('—');
    expect(haceCuanto(new Date(Date.now() - 5_000).toISOString())).toBe('hace instantes');
    expect(haceCuanto(new Date(Date.now() - 3 * 60_000).toISOString())).toBe('hace 3 min');
    expect(haceCuanto(new Date(Date.now() - 5 * 3_600_000).toISOString())).toBe('hace 5 h');
  });
});
