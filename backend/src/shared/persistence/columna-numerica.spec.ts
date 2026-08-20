import { columnaNumerica } from './columna-numerica';

describe('columnaNumerica', () => {
  it('convierte a numero lo que Postgres devuelve como string', () => {
    expect(columnaNumerica.from('87.40')).toBe(87.4);
  });

  it('preserva el null', () => {
    expect(columnaNumerica.from(null)).toBeNull();
  });

  it('devuelve algo comparable con >=, que es de lo que depende la regla de CU-05', () => {
    const nivel = columnaNumerica.from('87.40') as number;

    expect(nivel >= 70).toBe(true);
    // Sin el transformer esto seria la comparacion de strings '87.40' >= 70,
    // que en JavaScript da true por coercion, pero '9.00' >= 70 daria false.
    expect((columnaNumerica.from('9.00') as number) >= 70).toBe(false);
  });

  it('no toca el valor al escribir', () => {
    expect(columnaNumerica.to(87.4)).toBe(87.4);
  });
});
