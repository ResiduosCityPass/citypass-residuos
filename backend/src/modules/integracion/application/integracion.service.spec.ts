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
import { IntervencionesService } from './intervenciones.service';

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
  let intervenciones: { programarSiCorresponde: jest.Mock };
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
    intervenciones = { programarSiCorresponde: jest.fn().mockResolvedValue('programada') };

    service = new IntegracionService(
      integracion,
      contenedores as unknown as ContenedorRepository,
      eventos,
      zonas,
      { ejecutar: <T>(b: () => Promise<T>) => b() } as unknown as ContextoTransaccional,
      new ConfigService({}),
      intervenciones as unknown as IntervencionesService,
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

  describe('intervencion por emergencia (CU-01, A7)', () => {
    const resuelta = (tipo: string, cambios: Record<string, unknown> = {}) =>
      sobre(`com.citypass.emergencias.${tipo}`, {
        emergenciaId: 'EMG-1',
        estadoNuevo: 'RESUELTA',
        causasRelacionadas: ['RESIDUOS'],
        ubicacion: { lat: PLAZA_ITALIA.lat, lng: PLAZA_ITALIA.lng },
        ...cambios,
      });

    it.each(['EmergenciaActualizada', 'EmergenciaResuelta'])(
      '%s le pasa los datos a las intervenciones',
      async (tipo) => {
        await expect(service.procesar(resuelta(tipo))).resolves.toBe('procesado');

        expect(intervenciones.programarSiCorresponde).toHaveBeenCalledWith(
          expect.objectContaining({ emergenciaId: 'EMG-1' }),
        );
      },
    );

    it('una emergencia que solo cambia de estado no programa intervencion', async () => {
      await service.procesar(resuelta('EmergenciaActualizada', { estadoNuevo: 'EN_ATENCION' }));

      expect(intervenciones.programarSiCorresponde).not.toHaveBeenCalled();
    });

    it('una emergencia cancelada no programa intervencion', async () => {
      await service.procesar(resuelta('EmergenciaActualizada', { estadoNuevo: 'CANCELADA' }));

      expect(intervenciones.programarSiCorresponde).not.toHaveBeenCalled();
    });

    it('con cualquiera de los dos eventos corren las dos reacciones: desbloqueo e intervencion', async () => {
      for (const [tipo, eventId] of [
        ['EmergenciaActualizada', 'ev-a'],
        ['EmergenciaResuelta', 'ev-b'],
      ]) {
        await service.procesar(
          sobre(
            'com.citypass.emergencias.EmergenciaCreada',
            {
              emergenciaId: `EMG-${tipo}`,
              afectaCirculacion: true,
              latitud: PLAZA_ITALIA.lat,
              longitud: PLAZA_ITALIA.lng,
            },
            `${eventId}-creada`,
          ),
        );
        expect(bloqueada('z-palermo')).toBe(true);
        intervenciones.programarSiCorresponde.mockClear();

        await service.procesar(
          sobre(
            `com.citypass.emergencias.${tipo}`,
            {
              emergenciaId: `EMG-${tipo}`,
              estadoNuevo: 'RESUELTA',
              causasRelacionadas: ['RESIDUOS'],
              ubicacion: PLAZA_ITALIA,
            },
            eventId,
          ),
        );

        expect(bloqueada('z-palermo')).toBe(false);
        expect(intervenciones.programarSiCorresponde).toHaveBeenCalledTimes(1);
      }
    });

    it('EmergenciaResuelta desbloquea las zonas aunque no traiga estadoNuevo', async () => {
      await service.procesar(
        sobre('com.citypass.emergencias.EmergenciaCreada', {
          emergenciaId: 'EMG-1',
          afectaCirculacion: true,
          latitud: PLAZA_ITALIA.lat,
          longitud: PLAZA_ITALIA.lng,
        }),
      );
      expect(bloqueada('z-palermo')).toBe(true);

      await service.procesar(
        sobre(
          'com.citypass.emergencias.EmergenciaResuelta',
          { emergenciaId: 'EMG-1', causasRelacionadas: [] },
          'ev-2',
        ),
      );

      expect(bloqueada('z-palermo')).toBe(false);
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
