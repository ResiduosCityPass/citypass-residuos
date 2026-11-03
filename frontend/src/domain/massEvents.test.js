import { describe, it, expect } from 'vitest';
import { endLabel, endTime } from './massEvents.js';

// 20:00 en Buenos Aires (UTC-3).
const FIN = '2026-11-01T23:00:00.000Z';
const at = (iso) => new Date(iso).getTime();

describe('actividades masivas', () => {
  it('muestra la hora de fin en hora de Buenos Aires', () => {
    expect(endTime(FIN)).toBe('20:00');
  });

  it('antes del fin, cuenta lo que falta', () => {
    expect(endLabel(FIN, at('2026-11-01T20:45:00.000Z'))).toBe('Termina a las 20:00 (en 2 h 15 min)');
    expect(endLabel(FIN, at('2026-11-01T22:20:00.000Z'))).toBe('Termina a las 20:00 (en 40 min)');
    expect(endLabel(FIN, at('2026-11-01T21:00:00.000Z'))).toBe('Termina a las 20:00 (en 2 h)');
  });

  it('despues del fin, cuenta cuanto paso', () => {
    expect(endLabel(FIN, at('2026-11-01T23:40:00.000Z'))).toBe('Terminó a las 20:00 (hace 40 min)');
  });

  it('en el ultimo minuto no dice "0 min"', () => {
    expect(endLabel(FIN, at('2026-11-01T22:59:30.000Z'))).toBe(
      'Termina a las 20:00 (en menos de 1 min)',
    );
  });
});
