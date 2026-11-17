import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BARRIOS_CABA, BARRIO_IDS } from './barrios-caba';
import { CrearZonaDto } from '../application/dto/crear-zona.dto';
import { ActualizarZonaDto } from '../application/dto/actualizar-zona.dto';

describe('Catálogo común y vínculos de barrios', () => {
  const values = { nombre: 'Zona operativa', umbralCriticoPct: 70, umbralTemperaturaC: 60 };
  it('contiene los 48 códigos únicos y puntos WGS84 de Espacios', () => {
    expect(BARRIOS_CABA).toHaveLength(48);
    expect(new Set(BARRIO_IDS).size).toBe(48);
    expect(new Set(BARRIOS_CABA.map((b) => b.nombre)).size).toBe(48);
    for (const b of BARRIOS_CABA) {
      expect(b.id).toMatch(/^AR-CABA-[A-Z-]+$/);
      expect(b.localidad).toBe('CABA');
      expect(b.lat).toBeGreaterThan(-34.8);
      expect(b.lat).toBeLessThan(-34.5);
      expect(b.lng).toBeGreaterThan(-58.6);
      expect(b.lng).toBeLessThan(-58.3);
    }
    expect(BARRIOS_CABA.find((b) => b.id === 'AR-CABA-SAN-NICOLAS')).toMatchObject({
      nombre: 'SAN NICOLAS',
      lat: -34.603666,
      lng: -58.380515,
    });
    expect(BARRIOS_CABA.find((b) => b.id === 'AR-CABA-NUNEZ')).toMatchObject({
      nombre: 'NUÑEZ',
      lat: -34.543481,
      lng: -58.462751,
    });
  });
  it.each([undefined, [], ['AR-CABA-PALERMO'], [...BARRIO_IDS]])(
    'acepta vínculos opcionales válidos: %j',
    (barrioIds) => {
      expect(validateSync(plainToInstance(CrearZonaDto, { ...values, barrioIds }))).toHaveLength(0);
    },
  );
  it.each([
    null,
    'AR-CABA-PALERMO',
    ['PALERMO'],
    ['AR-CABA-DESCONOCIDO'],
    ['AR-CABA-PALERMO', 'AR-CABA-PALERMO'],
    [42],
    Array(49).fill('AR-CABA-PALERMO'),
  ])('rechaza vínculos inválidos tanto en alta como PATCH: %j', (barrioIds) => {
    expect(
      validateSync(plainToInstance(CrearZonaDto, { ...values, barrioIds })).length,
    ).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(ActualizarZonaDto, { barrioIds })).length).toBeGreaterThan(
      0,
    );
  });
  it('PATCH admite omitir vínculos y quitarlos explícitamente con []', () => {
    expect(validateSync(plainToInstance(ActualizarZonaDto, { umbralCriticoPct: 80 }))).toHaveLength(
      0,
    );
    expect(validateSync(plainToInstance(ActualizarZonaDto, { barrioIds: [] }))).toHaveLength(0);
  });
});
