import { distanciaKm, distanciaMetros } from './geo';

const OBELISCO = { lat: -34.6037, lng: -58.3816 };

describe('distanciaMetros', () => {
  it('es cero entre un punto y si mismo', () => {
    expect(distanciaMetros(OBELISCO, OBELISCO)).toBe(0);
  });

  it('un grado de latitud son unos 111 km', () => {
    const unGradoAlNorte = { lat: OBELISCO.lat + 1, lng: OBELISCO.lng };

    expect(distanciaMetros(OBELISCO, unGradoAlNorte)).toBeGreaterThan(110_000);
    expect(distanciaMetros(OBELISCO, unGradoAlNorte)).toBeLessThan(112_000);
  });

  it('es simetrica', () => {
    const otro = { lat: -34.61, lng: -58.39 };

    expect(distanciaMetros(OBELISCO, otro)).toBeCloseTo(distanciaMetros(otro, OBELISCO), 6);
  });

  it('coincide con una distancia conocida: Obelisco a La Bombonera, 3,88 km', () => {
    // Valor de control calculado aparte con la formula estandar de Haversine.
    const bombonera = { lat: -34.6356, lng: -58.3644 };

    expect(distanciaKm(OBELISCO, bombonera)).toBeCloseTo(3.88, 2);
  });

  it('no devuelve NaN por error de redondeo entre puntos casi iguales', () => {
    const casiIgual = { lat: OBELISCO.lat + 1e-12, lng: OBELISCO.lng };

    expect(Number.isNaN(distanciaMetros(OBELISCO, casiIgual))).toBe(false);
  });
});
