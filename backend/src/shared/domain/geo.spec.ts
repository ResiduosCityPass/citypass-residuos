import { dentroDelRadio, distanciaKm, distanciaMetros, ubicacionDe } from './geo';

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

describe('dentroDelRadio', () => {
  it('deja los que estan en el radio, con su distancia y en el orden en que vinieron', () => {
    const lejos = { id: 'lejos', lat: OBELISCO.lat + 0.01, lng: OBELISCO.lng };
    const a50m = { id: 'a50m', lat: OBELISCO.lat + 0.00045, lng: OBELISCO.lng };
    const encima = { id: 'encima', ...OBELISCO };

    const cercanos = dentroDelRadio(OBELISCO, [a50m, lejos, encima], 100);

    expect(cercanos.map(({ item }) => item.id)).toEqual(['a50m', 'encima']);
    expect(cercanos[0].distancia).toBeCloseTo(50, 0);
    expect(cercanos[1].distancia).toBe(0);
  });
});

describe('ubicacionDe', () => {
  it.each([
    [{ latitud: -34.6, longitud: -58.4 }],
    [{ lat: -34.6, lng: -58.4 }],
    [{ ubicacion: { lat: -34.6, lng: -58.4 } }],
    [{ ubicacion: { latitud: '-34.6', longitud: '-58.4' } }],
  ])('lee %j', (data) => {
    expect(ubicacionDe(data)).toEqual({ lat: -34.6, lng: -58.4 });
  });

  it.each([
    [{}],
    [{ latitud: -34.6 }],
    [{ latitud: 'abc', longitud: -58.4 }],
    [{ latitud: 91, longitud: -58.4 }],
    [{ ubicacion: null }],
  ])('devuelve null con %j', (data) => {
    expect(ubicacionDe(data)).toBeNull();
  });
});
