import { describe, it, expect } from 'vitest';
import { matchesPath, matchesAnyPath } from './paths.js';

describe('matchesPath', () => {
  it('matchea la ruta exacta', () => {
    expect(matchesPath('/chofer', '/chofer')).toBe(true);
  });

  it('matchea una subruta', () => {
    expect(matchesPath('/chofer/parada/7', '/chofer')).toBe(true);
  });

  /**
   * La razon de que este archivo exista: `/choferes` es el ABM del operador y
   * `/chofer` la pantalla del chofer en la calle. Con `startsWith` a secas la
   * primera se hacia pasar por la segunda.
   */
  it('NO matchea una ruta que solo comparte el prefijo', () => {
    expect(matchesPath('/choferes', '/chofer')).toBe(false);
  });

  it('no matchea una ruta distinta', () => {
    expect(matchesPath('/mapa', '/chofer')).toBe(false);
  });

  it('tolera un pathname vacio o ausente', () => {
    expect(matchesPath('', '/chofer')).toBe(false);
    expect(matchesPath(undefined, '/chofer')).toBe(false);
  });
});

describe('matchesAnyPath', () => {
  const PUBLICAS = ['/cerca', '/chofer'];

  it('matchea cualquiera de la lista', () => {
    expect(matchesAnyPath('/cerca', PUBLICAS)).toBe(true);
    expect(matchesAnyPath('/chofer', PUBLICAS)).toBe(true);
  });

  it('deja afuera las del operador, incluida /choferes', () => {
    expect(matchesAnyPath('/choferes', PUBLICAS)).toBe(false);
    expect(matchesAnyPath('/mapa', PUBLICAS)).toBe(false);
  });

  it('sin rutas no matchea nada', () => {
    expect(matchesAnyPath('/chofer')).toBe(false);
  });
});
