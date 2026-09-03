import { normalizarPatente } from './patente';

describe('normalizarPatente', () => {
  it('pasa a mayusculas', () => {
    expect(normalizarPatente('ab123cd')).toBe('AB123CD');
  });

  it('saca los espacios al principio y al final', () => {
    expect(normalizarPatente('  AB123CD  ')).toBe('AB123CD');
  });

  it('saca los espacios del medio', () => {
    expect(normalizarPatente('AB 123 CD')).toBe('AB123CD');
  });

  it('deja igual una patente ya normalizada', () => {
    expect(normalizarPatente('AB123CD')).toBe('AB123CD');
  });

  it('hace que dos escrituras de la misma patente colisionen', () => {
    // Es el punto: sin normalizar, la restriccion de unicidad no sirve de nada.
    expect(normalizarPatente('ab 123 cd')).toBe(normalizarPatente('AB123CD'));
  });
});
