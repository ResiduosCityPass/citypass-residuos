import { describe, it, expect } from 'vitest';
import { DEPOT, distanceKm, distanceMeters, withinMeters, formatDistance, toLatLng } from './geo.js';

const PALERMO = { lat: -34.5889, lng: -58.4106 };

describe('distanceKm', () => {
  it('un punto contra si mismo da cero', () => {
    expect(distanceKm(DEPOT, DEPOT)).toBe(0);
  });

  it('el Obelisco esta a unos 3 km de Palermo', () => {
    expect(distanceKm(DEPOT, PALERMO)).toBeCloseTo(3.1, 1);
  });

  it('es simetrica', () => {
    expect(distanceKm(DEPOT, PALERMO)).toBeCloseTo(distanceKm(PALERMO, DEPOT), 10);
  });
});

describe('distanceMeters', () => {
  it('son mil veces los kilometros', () => {
    expect(distanceMeters(DEPOT, PALERMO)).toBeCloseTo(distanceKm(DEPOT, PALERMO) * 1000, 6);
  });
});

describe('withinMeters', () => {
  /**
   * El borde cuenta como adentro: el chofer que esta parado justo a 100 m
   * puede confirmar. Si no, el radio configurado seria en realidad 99,9 m.
   */
  it('el borde exacto esta adentro', () => {
    const meters = distanceMeters(DEPOT, PALERMO);
    expect(withinMeters(DEPOT, PALERMO, meters)).toBe(true);
    expect(withinMeters(DEPOT, PALERMO, meters - 0.001)).toBe(false);
  });

  it('el Obelisco no esta a 100 m de Palermo', () => {
    expect(withinMeters(DEPOT, PALERMO, 100)).toBe(false);
  });
});

describe('formatDistance', () => {
  it('debajo del kilometro va en metros redondos', () => {
    expect(formatDistance(319.6)).toBe('320 m');
    expect(formatDistance(0)).toBe('0 m');
  });

  it('desde el kilometro va en kilometros con coma decimal', () => {
    expect(formatDistance(1000)).toBe('1,0 km');
    expect(formatDistance(1420)).toBe('1,4 km');
  });

  it('sin numero no inventa nada', () => {
    expect(formatDistance(undefined)).toBe('');
  });
});

describe('toLatLng', () => {
  it('pasa del objeto del dominio al par que quiere Leaflet', () => {
    expect(toLatLng(DEPOT)).toEqual([-34.6037, -58.3816]);
  });
});
