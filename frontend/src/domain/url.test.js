import { describe, it, expect } from 'vitest';
import { sinBarrasFinales } from './url.js';

describe('URL de Login', () => {
  it.each([
    ['', ''],
    ['///', ''],
    ['https://host/idp', 'https://host/idp'],
    ['https://host/idp///', 'https://host/idp'],
  ])('conserva el camino y elimina barras finales: %s', (input, expected) => {
    expect(sinBarrasFinales(input)).toBe(expected);
  });
});
