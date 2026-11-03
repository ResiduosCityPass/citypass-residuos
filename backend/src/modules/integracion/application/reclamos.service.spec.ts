import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../../../shared/domain/domain-event';
import { InMemoryEventPublisher } from '../../../shared/events/in-memory.event-publisher';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { ObstruccionRepository } from '../domain/integracion.repository';
import { ReclamosService } from './reclamos.service';

// El auto, un contenedor a ~9 m (tapado) y otro a ~110 m (no le molesta).
const AUTO = { lat: -34.6037, lng: -58.3816 };
const contenedor = (id: string, lat: number): Contenedor =>
  ({ id, codigo: id.toUpperCase(), lat, lng: AUTO.lng, activo: true }) as Contenedor;
const TAPADO = contenedor('ct-tapado', -34.60378);
const LEJOS = contenedor('ct-lejos', -34.6047);

const CREADO = 'com.citypass.reclamos.ReclamoCreado';
const reclamo = (cambios: Record<string, unknown> = {}) => ({
  reclamoId: 'RC-123',
  latitud: AUTO.lat,
  longitud: AUTO.lng,
  ...cambios,
});

describe('ReclamosService (CU-INT-02)', () => {
  let obstrucciones: jest.Mocked<ObstruccionRepository>;
  let contenedores: jest.Mocked<Pick<ContenedorRepository, 'listar'>>;
  let paradas: { quitarContenedores: jest.Mock };
  let eventos: InMemoryEventPublisher;
  let service: ReclamosService;

  beforeEach(() => {
    obstrucciones = {
      guardarObstrucciones: jest.fn(),
      resolverReclamo: jest.fn().mockResolvedValue(1),
      contenedoresObstruidos: jest.fn(),
    };
    contenedores = { listar: jest.fn().mockResolvedValue([TAPADO, LEJOS]) };
    paradas = { quitarContenedores: jest.fn().mockResolvedValue(['rt-1']) };
    eventos = new InMemoryEventPublisher();

    service = new ReclamosService(
      obstrucciones,
      contenedores as unknown as ContenedorRepository,
      eventos,
      paradas,
      new ConfigService({}),
    );
  });

  const evaluado = () => eventos.getPublished(EventTypes.RECLAMO_EVALUADO)[0]?.payload;

  describe('reclamo creado', () => {
    it('obstruye solo los contenedores dentro del radio', async () => {
      await service.procesar(CREADO, reclamo());

      expect(obstrucciones.guardarObstrucciones).toHaveBeenCalledWith([
        expect.objectContaining({
          reclamoId: 'RC-123',
          contenedorId: 'ct-tapado',
          venceEn: expect.any(Date),
        }),
      ]);
    });

    it('recalcula las rutas de los contenedores tapados con el motivo del reclamo', async () => {
      await service.procesar(CREADO, reclamo());

      expect(paradas.quitarContenedores).toHaveBeenCalledWith(
        ['ct-tapado'],
        'Acceso bloqueado por vehiculo (reclamo RC-123)',
        'RC-123',
      );
    });

    it('le responde a Reclamos que el auto afecta la recoleccion', async () => {
      await service.procesar(CREADO, reclamo());

      expect(evaluado()).toEqual(
        expect.objectContaining({
          reclamoId: 'RC-123',
          afectaRecoleccion: true,
          contenedoresAfectados: [{ codigo: 'CT-TAPADO', distanciaMetros: expect.any(Number) }],
          rutasRecalculadas: ['rt-1'],
        }),
      );
    });

    it('propaga el correlationId de Reclamos al evento que publica', async () => {
      await service.procesar(CREADO, reclamo({ correlationId: 'req-7c9e6679' }));

      expect(eventos.getPublished(EventTypes.RECLAMO_EVALUADO)[0].correlationId).toBe(
        'req-7c9e6679',
      );
    });

    it('un reclamo reclasificado a TRANSITO se evalua y obstruye el contenedor', async () => {
      await service.procesar('com.citypass.reclamos.ReclamoReclasificado', {
        ...reclamo(),
        categoriaAnterior: 'RUIDOS',
        categoriaNueva: 'TRANSITO',
        titulo: 'Auto sobre la bicisenda',
      });

      expect(paradas.quitarContenedores).toHaveBeenCalledWith(
        ['ct-tapado'],
        expect.any(String),
        'RC-123',
      );
    });

    it('el bloqueo vence a las horas configuradas', async () => {
      const conDosHoras = new ReclamosService(
        obstrucciones,
        contenedores as unknown as ContenedorRepository,
        eventos,
        paradas,
        new ConfigService({ OBSTRUCCION_VIGENCIA_HORAS: 2 }),
      );
      const antes = Date.now();

      await conDosHoras.procesar(CREADO, reclamo());

      const [[filas]] = obstrucciones.guardarObstrucciones.mock.calls;
      const venceEn = (filas[0].venceEn as Date).getTime();
      expect(venceEn - antes).toBeGreaterThanOrEqual(2 * 3_600_000);
      expect(venceEn - antes).toBeLessThan(2 * 3_600_000 + 5_000);
    });

    it('si el auto no tapa nada, no toca rutas pero igual responde', async () => {
      contenedores.listar.mockResolvedValue([LEJOS]);

      await service.procesar(CREADO, reclamo());

      expect(paradas.quitarContenedores).not.toHaveBeenCalled();
      expect(evaluado()).toEqual(
        expect.objectContaining({
          afectaRecoleccion: false,
          contenedoresAfectados: [],
          rutasRecalculadas: [],
        }),
      );
    });

    it('respeta el radio configurado', async () => {
      const conRadioGrande = new ReclamosService(
        obstrucciones,
        contenedores as unknown as ContenedorRepository,
        eventos,
        paradas,
        new ConfigService({ OBSTRUCCION_RADIO_METROS: 200 }),
      );

      await conRadioGrande.procesar(CREADO, reclamo());

      expect(paradas.quitarContenedores.mock.calls[0][0]).toEqual(['ct-tapado', 'ct-lejos']);
    });
  });

  it('el aviso de resolucion destapa los contenedores del reclamo', async () => {
    const procesado = await service.procesar('com.citypass.emergencias.IntervencionFinalizada', {
      reclamoId: 'RC-123',
    });

    expect(procesado).toBe(true);
    expect(obstrucciones.resolverReclamo).toHaveBeenCalledWith('RC-123', expect.any(Date));
    expect(paradas.quitarContenedores).not.toHaveBeenCalled();
  });

  it('un evento que no es un reclamo util devuelve false y no toca nada', async () => {
    expect(await service.procesar(CREADO, reclamo({ categoria: 'Luminaria rota' }))).toBe(false);
    expect(obstrucciones.guardarObstrucciones).not.toHaveBeenCalled();
    expect(eventos.getPublished(EventTypes.RECLAMO_EVALUADO)).toHaveLength(0);
  });
});
