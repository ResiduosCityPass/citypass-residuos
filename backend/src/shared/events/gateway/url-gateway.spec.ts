import { sinBarrasFinales } from './url-gateway';

describe('Normalizacion de URL EDA', () => {
  it.each([
    ['', ''],
    ['///', ''],
    ['https://host/api/v1', 'https://host/api/v1'],
    ['https://host/api/v1///', 'https://host/api/v1'],
  ])('normaliza %s sin modificar el camino interno', (input, expected) => {
    expect(sinBarrasFinales(input)).toBe(expected);
  });
});
