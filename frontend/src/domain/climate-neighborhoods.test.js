import { describe, it, expect } from 'vitest';
import { suggestClimateZones } from './climate-neighborhoods.js';
import { neighborhoods } from '../test/neighborhoods.js';
const zones = [{ id: 'z1', barrioIds: ['AR-CABA-SAN-NICOLAS'] }, { id: 'z2', barrioIds: ['AR-CABA-SAN-NICOLAS', 'AR-CABA-PALERMO'] }, { id: 'z3', barrioIds: ['AR-CABA-NUNEZ'] }, { id: 'z4', nombre: 'SAN NICOLAS', lat: -34.603666, lng: -58.380515 }];
describe('Sugerencias por catálogo común', () => {
  it('relaciona varios barrios y varias zonas sin repetir zonas ni inferir por nombre/coordenadas', () => {
    expect(suggestClimateZones(['San Nicolás', 'PALERMO', 'SAN NICOLAS'], zones, neighborhoods).zoneIds).toEqual(['z1', 'z2']);
  });
  it('admite códigos compartidos, tildes, ñ y separadores de nombres', () => {
    expect(suggestClimateZones([' ar-caba-san-nicolas ', 'Núñez', 'SAN_NICOLAS'], zones, neighborhoods).zoneIds).toEqual(['z1', 'z2', 'z3']);
  });
  it('informa desconocidos y barrios reconocidos sin vínculo', () => {
    expect(suggestClimateZones(['NUÑEZ', 'OTRA CIUDAD'], zones.slice(0, 2), neighborhoods)).toEqual({ zoneIds: [], unknownNames: ['OTRA CIUDAD'], unmappedNames: ['NUÑEZ'] });
  });
  it('sin barrios, catálogo o vínculos deja la decisión manual', () => {
    expect(suggestClimateZones().zoneIds).toEqual([]);
    expect(suggestClimateZones(['SAN NICOLAS'], [{ id: 'z1' }], neighborhoods).zoneIds).toEqual([]);
  });
  it('normaliza alias explícitos del catálogo sin coincidencias aproximadas', () => {
    const catalog = [{ id: 'b', nombre: 'BOCA' }, { id: 'p', nombre: 'PATERNAL' }, { id: 'm', nombre: 'VILLA GRAL. MITRE' }];
    expect(suggestClimateZones(['La Boca', 'La Paternal', 'Villa General Mitre'], [{ id: 'z', barrioIds: ['b', 'p', 'm'] }], catalog).zoneIds).toEqual(['z']);
    expect(suggestClimateZones(['PALERMO VIEJO'], zones, neighborhoods).zoneIds).toEqual([]);
  });
});
