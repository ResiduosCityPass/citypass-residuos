import { describe, it, expect } from 'vitest';
import { canPredict, confidenceLevel, formatHoursUntil, CONFIDENCE_FLOOR } from './states.js';

describe('CU-12 · cuando se puede predecir', () => {
  it('un contenedor sin lecturas no tiene de donde predecir', () => {
    // La regresion se hace sobre el historico de LECTURA: sin lecturas no hay
    // recta que ajustar, y preguntarle al backend seria pedir un error a proposito.
    expect(canPredict({ ultimaLecturaEn: null })).toBe(false);
    expect(canPredict({ ultimaLecturaEn: '2026-08-21T10:00:00.000Z' })).toBe(true);
  });
});

describe('nivel de confianza', () => {
  it('separa alta, media y baja', () => {
    expect(confidenceLevel(0.93)).toBe('alta');
    expect(confidenceLevel(0.8)).toBe('alta');
    expect(confidenceLevel(0.62)).toBe('media');
    expect(confidenceLevel(0.44)).toBe('baja');
  });

  it('el piso de utilidad es 0.5', () => {
    // Por debajo de ahi la prediccion existe pero no sirve para planificar un
    // camion, y la pantalla tiene que decirlo.
    expect(confidenceLevel(CONFIDENCE_FLOOR)).toBe('media');
    expect(confidenceLevel(CONFIDENCE_FLOOR - 0.01)).toBe('baja');
  });
});

describe('formato del tiempo hasta el umbral', () => {
  it('usa minutos, horas o dias segun el orden de magnitud', () => {
    expect(formatHoursUntil(0.5)).toBe('en 30 min');
    expect(formatHoursUntil(2.5)).toBe('en 2,5 h');
    expect(formatHoursUntil(72)).toBe('en 3 d');
  });

  it('un umbral ya cruzado no se muestra como tiempo futuro', () => {
    expect(formatHoursUntil(0)).toBe('ya superado');
    expect(formatHoursUntil(-3)).toBe('ya superado');
  });

  it('sin dato devuelve null en vez de inventar un texto', () => {
    expect(formatHoursUntil(null)).toBeNull();
    expect(formatHoursUntil(undefined)).toBeNull();
  });
});
