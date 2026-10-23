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
        correlationId: null,
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

  describe('contrato real de Reclamos (Grupo 5, 22/10)', () => {
    // Payloads tal cual los publica Reclamos en el gateway.
    const reclamoCreado = (cambios: Record<string, unknown> = {}) => ({
      reclamoId: 'b1d4e8f2-6a30-4c99-8e71-0f5a2d6c3b84',
      ciudadanoId: 'U000042',
      canal: 'APP',
      titulo: 'Auto estacionado sobre la ciclovia',
      descripcion: 'Hay un auto arriba de la bicisenda y no se puede pasar',
      categoria: 'TRANSITO',
      prioridad: 'ALTA',
      origenClasificacion: 'CIUDADANO',
      confianzaClasificacion: null,
      direccion: 'Av. Cordoba 4800',
      barrio: 'Palermo',
      latitud: -34.5955,
      longitud: -58.4281,
      afectaCirculacion: true,
      correlationId: 'req-7c9e6679',
      createdAt: 1792345678901,
      ...cambios,
    });

    it('un auto sobre la ciclovia, en TRANSITO, se procesa', () => {
      expect(interpretarReclamo(CREADO, reclamoCreado())).toEqual({
        tipo: 'creado',
        reclamoId: 'b1d4e8f2-6a30-4c99-8e71-0f5a2d6c3b84',
        ubicacion: { lat: -34.5955, lng: -58.4281 },
        // El de Reclamos: se propaga a ReclamoEvaluado para la trazabilidad.
        correlationId: 'req-7c9e6679',
      });
    });

    it('un problema de TRANSITO que no habla de un vehiculo se ignora', () => {
      expect(
        interpretarReclamo(
          CREADO,
          reclamoCreado({ titulo: 'Semaforo roto', descripcion: 'No funciona desde ayer' }),
        ),
      ).toBeNull();
    });

    it('un TRANSITO sin titulo ni descripcion se procesa: no hay como descartarlo', () => {
      expect(
        interpretarReclamo(CREADO, reclamoCreado({ titulo: undefined, descripcion: undefined })),
      ).not.toBeNull();
    });

    it('ignora los reclamos de RESIDUOS: los abre Reclamos con nuestras propias alertas', () => {
      expect(
        interpretarReclamo(
          CREADO,
          reclamoCreado({ categoria: 'RESIDUOS', titulo: 'Contenedor saturado CT-0421' }),
        ),
      ).toBeNull();
    });

    it('la resolucion llega en ReclamoActualizado con estadoNuevo RESUELTO', () => {
      expect(
        interpretarReclamo('com.citypass.reclamos.ReclamoActualizado', {
          reclamoId: 'b1d4e8f2-6a30-4c99-8e71-0f5a2d6c3b84',
          ciudadanoId: 'U000042',
          estadoAnterior: 'EN_PROCESO',
          estadoNuevo: 'RESUELTO',
          motivo: 'Se retiro el vehiculo',
          asignadoA: 'cuadrilla-3',
          cambiadoPor: 'operador-1',
          correlationId: 'req-7c9e6679',
          updatedAt: 1792349999000,
        }),
      ).toEqual({ tipo: 'resuelto', reclamoId: 'b1d4e8f2-6a30-4c99-8e71-0f5a2d6c3b84' });
    });

    it('un reclamo rechazado tambien libera el contenedor', () => {
      expect(
        interpretarReclamo('com.citypass.reclamos.ReclamoActualizado', {
          reclamoId: 'RC-1',
          estadoNuevo: 'RECHAZADO',
        })?.tipo,
      ).toBe('resuelto');
    });
  });

  describe('reclasificacion (propuesta de Reclamos, 22/10)', () => {
    const RECLASIFICADO = 'com.citypass.reclamos.ReclamoReclasificado';
    const reclasificado = (categoriaNueva: string, cambios: Record<string, unknown> = {}) => ({
      reclamoId: 'RC-9',
      categoriaAnterior: 'RUIDOS',
      categoriaNueva,
      titulo: 'Auto estacionado sobre la ciclovia',
      latitud: -34.6,
      longitud: -58.38,
      correlationId: 'req-9',
      ...cambios,
    });

    it('si pasa a ser un auto mal estacionado, se evalua como un reclamo nuevo', () => {
      expect(interpretarReclamo(RECLASIFICADO, reclasificado('TRANSITO'))).toEqual({
        tipo: 'creado',
        reclamoId: 'RC-9',
        ubicacion: { lat: -34.6, lng: -58.38 },
        correlationId: 'req-9',
      });
    });

    it('si deja de serlo, se libera como si se hubiera resuelto', () => {
      expect(
        interpretarReclamo(
          RECLASIFICADO,
          reclasificado('RUIDOS', { categoriaAnterior: 'TRANSITO' }),
        ),
      ).toEqual({ tipo: 'resuelto', reclamoId: 'RC-9' });
    });

    it('acepta la categoria nueva en `categoria` si no viene `categoriaNueva`', () => {
      expect(
        interpretarReclamo(
          RECLASIFICADO,
          reclasificado('TRANSITO', { categoriaNueva: undefined, categoria: 'TRANSITO' }),
        )?.tipo,
      ).toBe('creado');
    });

    it('sin categoria nueva no hay como decidir: se ignora', () => {
      expect(
        interpretarReclamo(RECLASIFICADO, reclasificado('TRANSITO', { categoriaNueva: undefined })),
      ).toBeNull();
    });

    it('pasar a TRANSITO sin ubicacion no se puede evaluar: se ignora', () => {
      expect(
        interpretarReclamo(
          RECLASIFICADO,
          reclasificado('TRANSITO', { latitud: undefined, longitud: undefined }),
        ),
      ).toBeNull();
    });

    it('solo se acepta del modulo de reclamos', () => {
      expect(
        interpretarReclamo('com.citypass.otro.ReclamoReclasificado', reclasificado('TRANSITO')),
      ).toBeNull();
    });
  });

  it('un correlationId vacio o demasiado largo se descarta, sin descartar el reclamo', () => {
    expect(interpretarReclamo(CREADO, { ...AUTO, correlationId: '  ' })).toMatchObject({
      tipo: 'creado',
      correlationId: null,
    });
    expect(interpretarReclamo(CREADO, { ...AUTO, correlationId: 'x'.repeat(129) })).toMatchObject({
      tipo: 'creado',
      correlationId: null,
    });
  });
});
