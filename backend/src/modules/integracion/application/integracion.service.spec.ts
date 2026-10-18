import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../../../shared/domain/domain-event';
import { InMemoryEventPublisher } from '../../../shared/events/in-memory.event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { ZonasService } from '../../zonas/application/zonas.service';
import { Zona } from '../../zonas/domain/zona.entity';
import { BloqueoPorIncidente } from '../domain/bloqueo-por-incidente.entity';
import { IntegracionRepository } from '../domain/integracion.repository';
import { IntegracionService, SobreGateway } from './integracion.service';

// Plaza Italia y un contenedor a ~100 m; otro en Caballito, a varios km.
const PLAZA_ITALIA = { lat: -34.5811, lng: -58.421 };
const contenedor = (id: string, zonaId: string, lat: number, lng: number): Contenedor =>
  ({ id, codigo: id.toUpperCase(), zonaId, lat, lng, activo: true }) as Contenedor;
const CERCA = contenedor('c-cerca', 'z-palermo', -34.5815, -58.4202);
const LEJOS = contenedor('c-lejos', 'z-caballito', -34.6186, -58.4421);

const sobre = (
  eventType: string,
  data: Record<string, unknown>,
  eventId = 'ev-1',
): SobreGateway => ({
  metadata: { eventId, eventType },
  data,
});

const eventoCultural = (cambios: Record<string, unknown> = {}) =>
  sobre('com.citypass.espacios.EventoComunitarioPublicado', {
    eventoId: 'evt-1',
    espacioId: 'sp-1',
    titulo: 'Feria del libro',
    zona: 'Palermo',
    latitud: PLAZA_ITALIA.lat,
    longitud: PLAZA_ITALIA.lng,
    inicio: '2026-11-01T15:00:00.000Z',
    fin: '2026-11-01T20:00:00.000Z',
    cupoMaximo: 300,
    ...cambios,
  });

describe('IntegracionService (CU-INT-01)', () => {
  let integracion: jest.Mocked<IntegracionRepository>;
  let contenedores: jest.Mocked<Pick<ContenedorRepository, 'listar'>>;
  let zonas: jest.Mocked<Pick<ZonasService, 'listar' | 'cambiarBloqueo'>>;
  let eventos: InMemoryEventPublisher;
  let service: IntegracionService;
  let bloqueos: BloqueoPorIncidente[];

  beforeEach(() => {
    bloqueos = [];
    integracion = {
      registrarEvento: jest.fn().mockResolvedValue(true),
      guardarRefuerzo: jest.fn().mockImplementation(async (r) => r),
      borrarRefuerzo: jest.fn(),
      guardarBloqueo: jest.fn().mockImplementation(async (b: BloqueoPorIncidente) => {
        bloqueos = [...bloqueos.filter((x) => x.emergenciaId !== b.emergenciaId), b];
        return b;
      }),
      buscarBloqueo: jest
        .fn()
        .mockImplementation(
          async (id: string) => bloqueos.find((b) => b.emergenciaId === id) ?? null,
        ),
      bloqueosActivos: jest.fn().mockImplementation(async () => bloqueos.filter((b) => b.activo)),
    };
    contenedores = { listar: jest.fn().mockResolvedValue([CERCA, LEJOS]) };
    zonas = {
      listar: jest.fn().mockResolvedValue([
        { id: 'z-palermo', bloqueada: false },
        { id: 'z-caballito', bloqueada: false },
      ] as Zona[]),
      cambiarBloqueo: jest.fn(),
    };
    eventos = new InMemoryEventPublisher();

    service = new IntegracionService(
      integracion,
      contenedores as unknown as ContenedorRepository,
      eventos,
      zonas as unknown as ZonasService,
      { ejecutar: <T>(b: () => Promise<T>) => b() } as unknown as ContextoTransaccional,
      new ConfigService({}),
    );
  });

  describe('evento cultural', () => {
    it('programa un refuerzo con los contenedores cercanos, desde el fin del evento', async () => {
      await expect(service.procesar(eventoCultural())).resolves.toBe('procesado');

      expect(integracion.guardarRefuerzo).toHaveBeenCalledWith({
        eventoId: 'evt-1',
        zona: 'Palermo',
        contenedorIds: ['c-cerca'],
        desde: new Date('2026-11-01T20:00:00.000Z'),
        hasta: new Date('2026-11-02T08:00:00.000Z'),
      });
      const publicados = eventos.getPublished(EventTypes.REFUERZO_PROGRAMADO);
      expect(publicados).toHaveLength(1);
      expect(publicados[0].payload).toMatchObject({ eventoId: 'evt-1', contenedores: 1 });
    });

    it('un evento chico no necesita refuerzo', async () => {
      await service.procesar(eventoCultural({ cupoMaximo: 40 }));

      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
    });

    it('sin contenedores cerca no programa nada', async () => {
      contenedores.listar.mockResolvedValue([LEJOS]);

      await service.procesar(eventoCultural());

      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
      expect(eventos.getPublished(EventTypes.REFUERZO_PROGRAMADO)).toHaveLength(0);
    });

    it('si el evento se cancela, se borra el refuerzo', async () => {
      await service.procesar(
        sobre('com.citypass.espacios.EventoCancelado', { eventoId: 'evt-1', motivo: 'lluvia' }),
      );

      expect(integracion.borrarRefuerzo).toHaveBeenCalledWith('evt-1');
    });
  });

  describe('emergencias', () => {
    const incendio = sobre('com.citypass.emergencias.EmergenciaCreada', {
      emergenciaId: 'em-1',
      categoria: 'INCENDIO',
      latitud: PLAZA_ITALIA.lat,
      longitud: PLAZA_ITALIA.lng,
      afectaCirculacion: true,
    });

    it('bloquea para el ruteo la zona de los contenedores cercanos', async () => {
      await service.procesar(incendio);

      expect(zonas.cambiarBloqueo).toHaveBeenCalledTimes(1);
      expect(zonas.cambiarBloqueo).toHaveBeenCalledWith('z-palermo', true);
    });

    it('una emergencia que no corta la circulacion no bloquea nada', async () => {
      await service.procesar(
        sobre('com.citypass.emergencias.EmergenciaCreada', {
          emergenciaId: 'em-2',
          categoria: 'MEDICA',
          latitud: null,
          longitud: null,
          afectaCirculacion: false,
        }),
      );

      expect(zonas.cambiarBloqueo).not.toHaveBeenCalled();
    });

    it('no toma como suya una zona que ya estaba bloqueada a mano', async () => {
      zonas.listar.mockResolvedValue([{ id: 'z-palermo', bloqueada: true }] as Zona[]);

      await service.procesar(incendio);
      await service.procesar(
        sobre(
          'com.citypass.emergencias.EmergenciaActualizada',
          { emergenciaId: 'em-1', estadoNuevo: 'RESUELTA' },
          'ev-2',
        ),
      );

      expect(zonas.cambiarBloqueo).not.toHaveBeenCalled();
    });

    it('al resolverse la emergencia desbloquea la zona', async () => {
      await service.procesar(incendio);
      await service.procesar(
        sobre(
          'com.citypass.emergencias.EmergenciaActualizada',
          { emergenciaId: 'em-1', estadoNuevo: 'RESUELTA' },
          'ev-2',
        ),
      );

      expect(zonas.cambiarBloqueo).toHaveBeenLastCalledWith('z-palermo', false);
    });

    it('un cambio de estado intermedio no desbloquea', async () => {
      await service.procesar(incendio);
      await service.procesar(
        sobre(
          'com.citypass.emergencias.EmergenciaActualizada',
          { emergenciaId: 'em-1', estadoNuevo: 'DESPACHADA' },
          'ev-2',
        ),
      );

      expect(zonas.cambiarBloqueo).toHaveBeenCalledTimes(1);
    });

    it('si otra emergencia activa bloquea la misma zona, sigue bloqueada', async () => {
      await service.procesar(incendio);
      bloqueos.push({
        emergenciaId: 'em-otra',
        zonaIds: ['z-palermo'],
        activo: true,
      } as BloqueoPorIncidente);

      await service.procesar(
        sobre(
          'com.citypass.emergencias.EmergenciaActualizada',
          { emergenciaId: 'em-1', estadoNuevo: 'CERRADA' },
          'ev-2',
        ),
      );

      expect(zonas.cambiarBloqueo).not.toHaveBeenCalledWith('z-palermo', false);
    });
  });

  it('una reentrega del mismo evento no se procesa dos veces', async () => {
    integracion.registrarEvento.mockResolvedValue(false);

    await expect(service.procesar(eventoCultural())).resolves.toBe('duplicado');
    expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
  });

  it('un tipo que no consumimos se ignora', async () => {
    await expect(
      service.procesar(sobre('com.citypass.movilidad.ViajeIniciado', { id: '1' })),
    ).resolves.toBe('ignorado');
  });

  it('un evento sin metadata se rechaza', async () => {
    await expect(service.procesar({ data: {} })).rejects.toBeInstanceOf(BadRequestException);
  });
});
