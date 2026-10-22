import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../../../shared/domain/domain-event';
import { InMemoryEventPublisher } from '../../../shared/events/in-memory.event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { ZonasService } from '../../zonas/application/zonas.service';
import { Zona } from '../../zonas/domain/zona.entity';
import { ZonaRepository } from '../../zonas/domain/zona.repository';
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
  let zonas: ZonasService;
  let eventos: InMemoryEventPublisher;
  let service: IntegracionService;
  let bloqueos: BloqueoPorIncidente[];
  let zonasGuardadas: Map<string, Zona>;

  const bloqueada = (zonaId: string) => zonasGuardadas.get(zonaId)?.bloqueada;

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
      guardarActividad: jest.fn().mockImplementation(async (a) => a),
      actividadesQueTerminanDespuesDe: jest.fn().mockResolvedValue([]),
    };
    contenedores = { listar: jest.fn().mockResolvedValue([CERCA, LEJOS]) };
    // ZonasService real sobre un repositorio en memoria, con estado como la base:
    // lo que bloquea una emergencia lo ve la siguiente, y el bloqueo de un
    // operador pasa por el mismo metodo que usa PATCH /zonas/:id/bloqueo.
    zonasGuardadas = new Map(
      ['z-palermo', 'z-caballito'].map((id) => [
        id,
        { id, bloqueada: false, bloqueoManual: false } as Zona,
      ]),
    );
    zonas = new ZonasService({
      buscarPorId: async (id: string) => zonasGuardadas.get(id) ?? null,
      listar: async () => [...zonasGuardadas.values()],
      guardar: async (zona: Zona) => {
        zonasGuardadas.set(zona.id, zona);
        return zona;
      },
    } as unknown as ZonaRepository);
    eventos = new InMemoryEventPublisher();

    service = new IntegracionService(
      integracion,
      contenedores as unknown as ContenedorRepository,
      eventos,
      zonas,
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

  describe('actividad masiva (squad 3)', () => {
    // Campos tal como los publica Espacios.
    const actividad = (cambios: Record<string, unknown> = {}) =>
      sobre('com.citypass.espacios.ActividadCreada', {
        communityEventId: 'act-1',
        title: 'Festival de Primavera',
        capacity: 5000,
        status: 'ACTIVE',
        startDate: '2026-11-01T15:00:00.000Z',
        endDate: '2026-11-01T20:00:00.000Z',
        latitude: PLAZA_ITALIA.lat,
        longitude: PLAZA_ITALIA.lng,
        ...cambios,
      });

    it('guarda la actividad con los contenedores cercanos', async () => {
      await expect(service.procesar(actividad())).resolves.toBe('procesado');

      expect(integracion.guardarActividad).toHaveBeenCalledWith({
        actividadId: 'act-1',
        titulo: 'Festival de Primavera',
        capacidad: 5000,
        lat: PLAZA_ITALIA.lat,
        lng: PLAZA_ITALIA.lng,
        inicio: new Date('2026-11-01T15:00:00.000Z'),
        fin: new Date('2026-11-01T20:00:00.000Z'),
        contenedorIds: ['c-cerca'],
      });
    });

    it('una actividad de menos de 1.000 personas no es masiva', async () => {
      await service.procesar(actividad({ capacity: 300 }));

      expect(integracion.guardarActividad).not.toHaveBeenCalled();
    });

    it('una actividad cancelada no se guarda', async () => {
      await service.procesar(actividad({ status: 'CANCELLED' }));

      expect(integracion.guardarActividad).not.toHaveBeenCalled();
    });

    it('sin coordenadas no se guarda', async () => {
      await service.procesar(actividad({ latitude: undefined, longitude: undefined }));

      expect(integracion.guardarActividad).not.toHaveBeenCalled();
    });

    it('agenda la escuadrilla: los contenedores entran al ruteo desde el fin y por 6 h', async () => {
      await service.procesar(actividad());

      expect(integracion.guardarRefuerzo).toHaveBeenCalledWith({
        eventoId: 'act-act-1',
        zona: null,
        contenedorIds: ['c-cerca'],
        desde: new Date('2026-11-01T20:00:00.000Z'),
        hasta: new Date('2026-11-02T02:00:00.000Z'),
      });
      // El aviso de refuerzo es de CU-INT-01: la escuadrilla no lo publica.
      expect(eventos.getPublished(EventTypes.REFUERZO_PROGRAMADO)).toHaveLength(0);
    });

    it('sin contenedores cerca guarda la actividad pero no agenda escuadrilla', async () => {
      contenedores.listar.mockResolvedValue([LEJOS]);

      await service.procesar(actividad());

      expect(integracion.guardarActividad).toHaveBeenCalledWith(
        expect.objectContaining({ contenedorIds: [] }),
      );
      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
    });

    it('para el mapa trae las que terminaron hace menos de 6 h, con su radio', async () => {
      integracion.actividadesQueTerminanDespuesDe.mockResolvedValue([
        {
          actividadId: 'act-1',
          titulo: 'Festival de Primavera',
          capacidad: 5000,
          lat: PLAZA_ITALIA.lat,
          lng: PLAZA_ITALIA.lng,
          inicio: new Date('2026-11-01T15:00:00.000Z'),
          fin: new Date('2026-11-01T20:00:00.000Z'),
          contenedorIds: ['c-cerca'],
          creadaEn: new Date(),
        },
      ]);

      const zonas = await service.actividadesParaMapa(new Date('2026-11-01T22:00:00.000Z'));

      expect(integracion.actividadesQueTerminanDespuesDe).toHaveBeenCalledWith(
        new Date('2026-11-01T16:00:00.000Z'),
      );
      expect(zonas).toEqual([
        {
          actividadId: 'act-1',
          titulo: 'Festival de Primavera',
          capacidad: 5000,
          lat: PLAZA_ITALIA.lat,
          lng: PLAZA_ITALIA.lng,
          radioMetros: 300,
          inicio: '2026-11-01T15:00:00.000Z',
          fin: '2026-11-01T20:00:00.000Z',
          contenedores: 1,
        },
      ]);
    });

    it('rechaza una fecha de fin invalida', async () => {
      await expect(service.procesar(actividad({ endDate: 'mañana' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
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

    const termina = (emergenciaId: string, eventId: string, estadoNuevo = 'RESUELTA') =>
      sobre(
        'com.citypass.emergencias.EmergenciaActualizada',
        { emergenciaId, estadoNuevo },
        eventId,
      );

    it('bloquea para el ruteo la zona de los contenedores cercanos', async () => {
      await service.procesar(incendio);

      expect(bloqueada('z-palermo')).toBe(true);
      expect(bloqueada('z-caballito')).toBe(false);
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

      expect(bloqueada('z-palermo')).toBe(false);
    });

    it('al resolverse la emergencia desbloquea la zona', async () => {
      await service.procesar(incendio);
      await service.procesar(termina('em-1', 'ev-2'));

      expect(bloqueada('z-palermo')).toBe(false);
    });

    it('un cambio de estado intermedio no desbloquea', async () => {
      await service.procesar(incendio);
      await service.procesar(termina('em-1', 'ev-2', 'DESPACHADA'));

      expect(bloqueada('z-palermo')).toBe(true);
    });

    it('con dos emergencias en la misma zona, sigue bloqueada hasta que terminan las dos', async () => {
      await service.procesar(incendio);
      await service.procesar(
        sobre(
          'com.citypass.emergencias.EmergenciaCreada',
          {
            emergenciaId: 'em-2',
            categoria: 'DERRUMBE',
            latitud: PLAZA_ITALIA.lat,
            longitud: PLAZA_ITALIA.lng,
            afectaCirculacion: true,
          },
          'ev-2',
        ),
      );

      await service.procesar(termina('em-1', 'ev-3'));
      expect(bloqueada('z-palermo')).toBe(true);

      await service.procesar(termina('em-2', 'ev-4'));
      expect(bloqueada('z-palermo')).toBe(false);
    });

    describe('bloqueo manual de un operador', () => {
      it('hecho antes de la emergencia, sigue al terminar la emergencia', async () => {
        await zonas.cambiarBloqueo('z-palermo', true);

        await service.procesar(incendio);
        await service.procesar(termina('em-1', 'ev-2'));

        expect(bloqueada('z-palermo')).toBe(true);
      });

      it('hecho durante la emergencia, sigue al terminar la emergencia', async () => {
        await service.procesar(incendio);
        await zonas.cambiarBloqueo('z-palermo', true);
        await service.procesar(termina('em-1', 'ev-2'));

        expect(bloqueada('z-palermo')).toBe(true);
      });

      it('desbloquear a mano libera la zona aunque la emergencia siga activa', async () => {
        await service.procesar(incendio);
        await zonas.cambiarBloqueo('z-palermo', false);

        expect(bloqueada('z-palermo')).toBe(false);
      });
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
