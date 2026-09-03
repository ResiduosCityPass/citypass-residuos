import { describe, it, expect } from 'vitest';
import {
  colorForState,
  COLOR_BY_STATE,
  neverReported,
  timeAgo,
  canConfirmStop,
  canSkipStop,
  stopsProgress,
  isRouteLive,
  colorForWasteType,
  WASTE_TYPE_COLOR,
} from './states.js';

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

  /* --- CU-10 · paradas --------------------------------------------------- */

  /**
   * Igual que canAcknowledge y canResolve: la UI deshabilita el boton para no
   * comerse un 409, pero el backend valida de todos modos.
   */
  it('solo una parada PENDIENTE se puede confirmar', () => {
    expect(canConfirmStop({ estado: 'PENDIENTE' })).toBe(true);
    expect(canConfirmStop({ estado: 'CONFIRMADA' })).toBe(false);
    expect(canConfirmStop({ estado: 'OMITIDA' })).toBe(false);
    expect(canConfirmStop(undefined)).toBe(false);
  });

  /**
   * Omitir es el otro final de la parada, y cierra igual que confirmar. Una
   * parada ya cerrada no se reabre por ninguno de los dos caminos: los dos
   * devuelven 409.
   */
  it('solo una parada PENDIENTE se puede omitir', () => {
    expect(canSkipStop({ estado: 'PENDIENTE' })).toBe(true);
    expect(canSkipStop({ estado: 'CONFIRMADA' })).toBe(false);
    expect(canSkipStop({ estado: 'OMITIDA' })).toBe(false);
    expect(canSkipStop(undefined)).toBe(false);
  });

  it('el progreso separa lo vaciado de lo cerrado', () => {
    expect(stopsProgress([{ estado: 'CONFIRMADA' }, { estado: 'PENDIENTE' }])).toEqual({
      confirmed: 1,
      skipped: 0,
      closed: 1,
      total: 2,
    });
    // Una parada omitida NO esta vaciada, pero SI esta cerrada. Si las dos
    // cosas se contaran juntas, una ruta donde el chofer no pudo vaciar nada
    // mostraria "1 de 1 vaciados", que es lo contrario de lo que paso.
    expect(stopsProgress([{ estado: 'OMITIDA' }])).toEqual({
      confirmed: 0,
      skipped: 1,
      closed: 1,
      total: 1,
    });
    expect(stopsProgress()).toEqual({ confirmed: 0, skipped: 0, closed: 0, total: 0 });
  });

  it('una ruta viva es la que el chofer todavia tiene que recorrer', () => {
    expect(isRouteLive({ estado: 'ASIGNADA' })).toBe(true);
    expect(isRouteLive({ estado: 'EN_CURSO' })).toBe(true);
    expect(isRouteLive({ estado: 'PROPUESTA' })).toBe(false);
    expect(isRouteLive({ estado: 'COMPLETADA' })).toBe(false);
    expect(isRouteLive(null)).toBe(false);
  });

  /* --- CU-11 · colores por tipo ------------------------------------------ */

  it('la vista ciudadana colorea por tipo de residuo, no por estado', () => {
    expect(colorForWasteType('RECICLABLE')).toBe(WASTE_TYPE_COLOR.RECICLABLE);
    // Un tipo desconocido no rompe el mapa: cae en el gris de COMUN.
    expect(colorForWasteType('LO_QUE_SEA')).toBe(WASTE_TYPE_COLOR.COMUN);
  });
});
