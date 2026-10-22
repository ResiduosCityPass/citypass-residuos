import { interpretarReclamo } from './contrato-reclamos';

const CREADO = 'com.citypass.reclamos.ReclamoCreado';
const AUTO = { reclamoId: 'RC-1', latitud: -34.6037, longitud: -58.3816 };

describe('interpretarReclamo (CU-INT-02)', () => {
  describe('reclamo creado', () => {
    it('lee el formato de Emergencias: reclamoId, latitud y longitud', () => {
      expect(interpretarReclamo(CREADO, AUTO)).toEqual({
        tipo: 'creado',
        reclamoId: 'RC-1',
        ubicacion: { lat: -34.6037, lng: -58.3816 },
      });
    });

    it.each(['ReclamoRegistrado', 'ReclamoPublicado'])('acepta %s como sinonimo', (nombre) => {
      expect(interpretarReclamo(`com.citypass.reclamos.${nombre}`, AUTO)?.tipo).toBe('creado');
    });

    it.each<[string, Record<string, unknown>]>([
      ['idReclamo y lat/lng', { idReclamo: 'RC-1', lat: -34.6, lng: -58.3 }],
      [
        'id numerico y ubicacion anidada',
        { id: 42, ubicacion: { latitud: -34.6, longitud: -58.3 } },
      ],
      ['coordenadas en texto', { id: 'RC-1', latitud: '-34.6', longitud: '-58.3' }],
    ])('acepta variantes de campos: %s', (_caso, data) => {
      expect(interpretarReclamo(CREADO, data)?.tipo).toBe('creado');
    });

    it('sin categoria se procesa; con categoria de estacionamiento tambien', () => {
      expect(interpretarReclamo(CREADO, AUTO)).not.toBeNull();
      expect(
        interpretarReclamo(CREADO, { ...AUTO, categoria: 'Vehículo mal estacionado' }),
      ).not.toBeNull();
      expect(interpretarReclamo(CREADO, { ...AUTO, categoria: 'BLOQUEO_CICLOVIA' })).not.toBeNull();
    });

    it('ignora reclamos de otra categoria', () => {
      expect(interpretarReclamo(CREADO, { ...AUTO, categoria: 'Luminaria rota' })).toBeNull();
    });

    it('ignora un reclamo creado que no viene del modulo de reclamos', () => {
      expect(interpretarReclamo('com.citypass.otro.ReclamoCreado', AUTO)).toBeNull();
    });

    it('sin coordenadas validas no se puede saber que tapa: se ignora', () => {
      expect(interpretarReclamo(CREADO, { reclamoId: 'RC-1' })).toBeNull();
      expect(interpretarReclamo(CREADO, { ...AUTO, latitud: 'cerca de la plaza' })).toBeNull();
      expect(interpretarReclamo(CREADO, { ...AUTO, latitud: 123 })).toBeNull();
    });

    it('sin id de reclamo no se puede resolver despues: se ignora', () => {
      expect(interpretarReclamo(CREADO, { latitud: -34.6, longitud: -58.3 })).toBeNull();
      expect(interpretarReclamo(CREADO, { ...AUTO, reclamoId: '  ' })).toBeNull();
      expect(interpretarReclamo(CREADO, { ...AUTO, reclamoId: 'x'.repeat(65) })).toBeNull();
    });
  });

  describe('aviso de resolucion', () => {
    it.each([
      'com.citypass.reclamos.ReclamoResuelto',
      'com.citypass.emergencias.IntervencionFinalizada',
      'com.citypass.transito.ObstruccionLiberada',
      'com.citypass.reclamos.ReclamoCerrado',
    ])('lo acepta venga de donde venga: %s', (eventType) => {
      expect(interpretarReclamo(eventType, { reclamoId: 'RC-1' })).toEqual({
        tipo: 'resuelto',
        reclamoId: 'RC-1',
      });
    });

    it('un ReclamoActualizado cuenta como resolucion solo si quedo resuelto', () => {
      const actualizado = 'com.citypass.reclamos.ReclamoActualizado';

      expect(
        interpretarReclamo(actualizado, { reclamoId: 'RC-1', estadoNuevo: 'resuelto' }),
      ).toEqual({ tipo: 'resuelto', reclamoId: 'RC-1' });
      expect(interpretarReclamo(actualizado, { reclamoId: 'RC-1', estado: 'CERRADO' })?.tipo).toBe(
        'resuelto',
      );
      expect(interpretarReclamo(actualizado, { reclamoId: 'RC-1', estado: 'EN_CURSO' })).toBeNull();
    });
  });

  it('cualquier otro evento se ignora', () => {
    expect(interpretarReclamo('com.citypass.espacios.EventoCancelado', AUTO)).toBeNull();
  });
});
