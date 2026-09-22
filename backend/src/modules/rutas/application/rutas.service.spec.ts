import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../../../shared/domain/domain-event';
import {
  EstadoCamion,
  EstadoContenedor,
  EstadoRuta,
  TipoResiduo,
} from '../../../shared/domain/enums';
import { InMemoryEventPublisher } from '../../../shared/events/in-memory.event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { ChoferesService } from '../../choferes/application/choferes.service';
import { Chofer } from '../../choferes/domain/chofer.entity';
import { Camion } from '../../flota/domain/camion.entity';
import { FlotaService } from '../../flota/application/flota.service';
import { ZonasService } from '../../zonas/application/zonas.service';
import { Zona } from '../../zonas/domain/zona.entity';
import { ParadaRepository } from '../domain/parada.repository';
import { Ruta } from '../domain/ruta.entity';
import { RutaRepository } from '../domain/ruta.repository';
import { RutasService } from './rutas.service';

const CAMION = {
  id: 'cm-1',
  patente: 'AB123CD',
  capacidadLitros: 10_000,
  tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
  estado: EstadoCamion.DISPONIBLE,
} as Camion;

const ZONA = { id: 'z-1', nombre: 'Centro', bloqueada: false } as Zona;

const CHOFER = { id: 'ch-1', nombre: 'Juana Perez', legajo: 'CH-014', activo: true } as Chofer;

const contenedor = (id: string, gradosAlSur: number, nivel = 90): Contenedor =>
  ({
    id,
    codigo: id.toUpperCase(),
    zonaId: 'z-1',
    lat: -34.6037 - gradosAlSur,
    lng: -58.3816,
    capacidadLitros: 1100,
    nivelLlenadoPct: nivel,
    estado: EstadoContenedor.CRITICO,
    tipoResiduo: TipoResiduo.RECICLABLE,
  }) as Contenedor;

describe('RutasService (CU-08, CU-09)', () => {
  let rutas: jest.Mocked<RutaRepository>;
  let paradas: jest.Mocked<ParadaRepository>;
  let contenedores: jest.Mocked<ContenedorRepository>;
  let eventos: InMemoryEventPublisher;
  let flota: jest.Mocked<Pick<FlotaService, 'obtener' | 'guardarEstado'>>;
  let choferes: jest.Mocked<Pick<ChoferesService, 'obtenerActivo' | 'buscarActivoPorUsuarioSub'>>;
  let zonas: jest.Mocked<Pick<ZonasService, 'listar'>>;
  let service: RutasService;

  const rutaCreada = (parcial: Partial<Ruta> = {}): Ruta =>
    ({
      id: 'rt-1',
      camionId: 'cm-1',
      choferId: null,
      estado: EstadoRuta.PROPUESTA,
      distanciaEstimadaKm: 5,
      litrosEstimados: 2000,
      paradas: [],
      camion: CAMION,
      ...parcial,
    }) as Ruta;

  beforeEach(() => {
    rutas = {
      crear: jest.fn().mockResolvedValue(rutaCreada()),
      guardar: jest.fn().mockImplementation(async (r) => r),
      buscarPorId: jest.fn().mockResolvedValue(rutaCreada()),
      listar: jest.fn().mockResolvedValue([]),
      buscarActivaDeChofer: jest.fn().mockResolvedValue(null),
      contenedoresEnRutasVivas: jest.fn().mockResolvedValue([]),
      avanceDeParadas: jest.fn().mockResolvedValue(new Map()),
    };
    paradas = {
      crearVarias: jest.fn().mockResolvedValue([]),
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      listarDeRuta: jest.fn().mockResolvedValue([]),
    };
    contenedores = {
      crear: jest.fn(),
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorCodigo: jest.fn(),
      listar: jest.fn().mockResolvedValue([contenedor('c-1', 0.005), contenedor('c-2', 0.02)]),
      listarConZona: jest.fn(),
      contar: jest.fn(),
    };
    eventos = new InMemoryEventPublisher();
    flota = {
      obtener: jest.fn().mockResolvedValue({ ...CAMION }),
      guardarEstado: jest.fn().mockImplementation(async (c) => c),
    };
    choferes = {
      obtenerActivo: jest.fn().mockResolvedValue(CHOFER),
      buscarActivoPorUsuarioSub: jest.fn().mockResolvedValue(CHOFER),
    };
    zonas = { listar: jest.fn().mockResolvedValue([ZONA]) };

    service = new RutasService(
      rutas,
      paradas,
      contenedores,
      eventos,
      flota as unknown as FlotaService,
      choferes as unknown as ChoferesService,
      zonas as unknown as ZonasService,
      { ejecutar: <T>(b: () => Promise<T>) => b() } as unknown as ContextoTransaccional,
      new ConfigService({}),
    );
  });

  describe('CU-08 · generar', () => {
    it('crea la ruta en estado PROPUESTA', async () => {
      await service.generar({ camionId: 'cm-1' });

      expect(rutas.crear).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoRuta.PROPUESTA, choferId: null }),
      );
    });

    it('NO toma el camion al generar: es una propuesta hasta que alguien la confirme', async () => {
      await service.generar({ camionId: 'cm-1' });

      expect(flota.guardarEstado).not.toHaveBeenCalled();
    });

    it('crea las paradas numeradas desde 1 y en orden', async () => {
      await service.generar({ camionId: 'cm-1' });

      const creadas = paradas.crearVarias.mock.calls[0][0];
      expect(creadas.map((p) => p.orden)).toEqual([1, 2]);
      // El mas cercano al deposito primero.
      expect(creadas[0].contenedorId).toBe('c-1');
    });

    it('publica residuos.ruta.generada', async () => {
      await service.generar({ camionId: 'cm-1' });

      const publicados = eventos.getPublished(EventTypes.RUTA_GENERADA);
      expect(publicados).toHaveLength(1);
      expect(publicados[0].payload).toMatchObject({ cantidadParadas: 2 });
    });

    it('solo considera contenedores criticos del tipo que el camion puede levantar', async () => {
      await service.generar({ camionId: 'cm-1' });

      expect(contenedores.listar).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: EstadoContenedor.CRITICO,
          tipoResiduo: TipoResiduo.RECICLABLE,
          soloActivos: true,
        }),
      );
    });

    it('excluye los contenedores ya comprometidos en otra ruta viva', async () => {
      rutas.contenedoresEnRutasVivas.mockResolvedValue(['c-1']);

      await service.generar({ camionId: 'cm-1' });

      const creadas = paradas.crearVarias.mock.calls[0][0];
      expect(creadas.map((p) => p.contenedorId)).toEqual(['c-2']);
    });

    it('excluye las zonas bloqueadas', async () => {
      zonas.listar.mockResolvedValue([{ ...ZONA, bloqueada: true } as Zona]);

      await expect(service.generar({ camionId: 'cm-1' })).rejects.toMatchObject({
        response: { code: 'RUTA_SIN_CONTENEDORES' },
      });
    });

    it('rechaza un camion que no esta disponible', async () => {
      flota.obtener.mockResolvedValue({ ...CAMION, estado: EstadoCamion.EN_RUTA } as Camion);

      await expect(service.generar({ camionId: 'cm-1' })).rejects.toMatchObject({
        response: { code: 'CAMION_NO_DISPONIBLE' },
      });
    });

    it('rechaza cuando no hay contenedores criticos sin rutear', async () => {
      contenedores.listar.mockResolvedValue([]);

      await expect(service.generar({ camionId: 'cm-1' })).rejects.toThrow(ConflictException);
    });

    it('rechaza cuando ninguno entra en la capacidad del camion', async () => {
      flota.obtener.mockResolvedValue({ ...CAMION, capacidadLitros: 100 } as Camion);

      await expect(service.generar({ camionId: 'cm-1' })).rejects.toMatchObject({
        response: { code: 'RUTA_SIN_CONTENEDORES' },
      });
    });
  });

  describe('CU-09 · asignar', () => {
    it('pasa la ruta a ASIGNADA con su chofer', async () => {
      const ruta = rutaCreada();
      rutas.buscarPorId.mockResolvedValue(ruta);

      await service.asignar('rt-1', { choferId: 'ch-1' });

      expect(ruta.estado).toBe(EstadoRuta.ASIGNADA);
      expect(ruta.choferId).toBe('ch-1');
      expect(ruta.asignadaEn).toBeInstanceOf(Date);
    });

    it('valida que el chofer exista y este activo antes de asignar', async () => {
      // Sin esta validacion, un id equivocado asignaba la ruta con exito y el
      // chofer no la veia nunca: la falla era silenciosa.
      await service.asignar('rt-1', { choferId: 'ch-1' });

      expect(choferes.obtenerActivo).toHaveBeenCalledWith('ch-1');
    });

    it('no asigna si el chofer no existe', async () => {
      choferes.obtenerActivo.mockRejectedValue(
        new NotFoundException({ code: 'CHOFER_NO_ENCONTRADO' }),
      );

      await expect(service.asignar('rt-1', { choferId: 'ch-fantasma' })).rejects.toThrow(
        NotFoundException,
      );
      expect(flota.guardarEstado).not.toHaveBeenCalled();
    });

    it('recien ahi toma el camion', async () => {
      await service.asignar('rt-1', { choferId: 'ch-1' });

      expect(flota.guardarEstado).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoCamion.EN_RUTA }),
      );
    });

    it('publica residuos.ruta.asignada', async () => {
      await service.asignar('rt-1', { choferId: 'ch-1' });

      expect(eventos.getPublished(EventTypes.RUTA_ASIGNADA)).toHaveLength(1);
    });

    it('solo se asigna desde PROPUESTA', async () => {
      rutas.buscarPorId.mockResolvedValue(rutaCreada({ estado: EstadoRuta.ASIGNADA }));

      await expect(service.asignar('rt-1', { choferId: 'ch-1' })).rejects.toMatchObject({
        response: { code: 'RUTA_NO_PROPUESTA' },
      });
    });

    it('falla con 404 si la ruta no existe', async () => {
      rutas.buscarPorId.mockResolvedValue(null);

      await expect(service.asignar('rt-fantasma', { choferId: 'ch-1' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([EstadoCamion.EN_RUTA, EstadoCamion.MANTENIMIENTO])(
      'no asigna si el camion paso a %s despues de generar la propuesta',
      async (estado) => {
        // Generar no reserva el camion. Sin este control, el mismo camion
        // quedaba con dos rutas vivas, o salia de mantenimiento sin avisar.
        flota.obtener.mockResolvedValue({ ...CAMION, estado } as Camion);

        await expect(service.asignar('rt-1', { choferId: 'ch-1' })).rejects.toMatchObject({
          response: { code: 'CAMION_NO_DISPONIBLE' },
        });
        expect(rutas.guardar).not.toHaveBeenCalled();
        expect(flota.guardarEstado).not.toHaveBeenCalled();
      },
    );
  });

  describe('CU-08 · descartar', () => {
    it('pasa la propuesta a CANCELADA, que libera sus contenedores', async () => {
      const ruta = rutaCreada();
      rutas.buscarPorId.mockResolvedValue(ruta);

      await service.descartar('rt-1');

      // CANCELADA no esta entre los estados vivos, asi que sus contenedores
      // vuelven a quedar disponibles para otra ruta.
      expect(ruta.estado).toBe(EstadoRuta.CANCELADA);
      expect(rutas.guardar).toHaveBeenCalledWith(ruta);
    });

    it('no toca el camion: una propuesta nunca lo tomo', async () => {
      await service.descartar('rt-1');

      expect(flota.guardarEstado).not.toHaveBeenCalled();
    });

    it('una ruta ya asignada no se descarta: tiene un chofer en la calle', async () => {
      rutas.buscarPorId.mockResolvedValue(rutaCreada({ estado: EstadoRuta.ASIGNADA }));

      await expect(service.descartar('rt-1')).rejects.toMatchObject({
        response: { code: 'RUTA_NO_PROPUESTA' },
      });
      expect(rutas.guardar).not.toHaveBeenCalled();
    });
  });

  describe('listar · avance de paradas', () => {
    it('adjunta el avance a cada ruta con una sola consulta', async () => {
      rutas.listar.mockResolvedValue([rutaCreada({ id: 'rt-1' }), rutaCreada({ id: 'rt-2' })]);
      rutas.avanceDeParadas.mockResolvedValue(
        new Map([
          ['rt-1', { total: 3, confirmadas: 2, omitidas: 0, pendientes: 1 }],
          ['rt-2', { total: 2, confirmadas: 1, omitidas: 1, pendientes: 0 }],
        ]),
      );

      const listado = await service.listar({});

      expect(rutas.avanceDeParadas).toHaveBeenCalledTimes(1);
      expect(rutas.avanceDeParadas).toHaveBeenCalledWith(['rt-1', 'rt-2']);
      expect(listado[0].avance).toEqual({ total: 3, confirmadas: 2, omitidas: 0, pendientes: 1 });
      expect(listado[1].avance).toEqual({ total: 2, confirmadas: 1, omitidas: 1, pendientes: 0 });
    });

    it('una ruta sin paradas trae el avance en cero, no undefined', async () => {
      // La tabla del frontend hace `avance.confirmadas` sin preguntar: dejarlo
      // en undefined le rompe la fila en vez de mostrarle "0 de 0".
      rutas.listar.mockResolvedValue([rutaCreada()]);
      rutas.avanceDeParadas.mockResolvedValue(new Map());

      const [ruta] = await service.listar({});

      expect(ruta.avance).toEqual({ total: 0, confirmadas: 0, omitidas: 0, pendientes: 0 });
    });

    it('no consulta el avance cuando no hay rutas', async () => {
      rutas.listar.mockResolvedValue([]);

      await service.listar({});

      expect(rutas.avanceDeParadas).toHaveBeenCalledWith([]);
    });
  });

  describe('rutaActivaDeSesion', () => {
    it('resuelve el chofer desde la sesion y busca por su id', async () => {
      // La identidad entra como `sub` del token, no como id de chofer: quien
      // llama no elige de quien es la ruta que pide.
      await service.rutaActivaDeSesion('dev-chofer');

      expect(choferes.buscarActivoPorUsuarioSub).toHaveBeenCalledWith('dev-chofer');
      expect(rutas.buscarActivaDeChofer).toHaveBeenCalledWith('ch-1');
    });

    it('devuelve null si el chofer no tiene ruta activa', async () => {
      await expect(service.rutaActivaDeSesion('dev-chofer')).resolves.toBeNull();
    });

    it('devuelve null si la sesion no es de ningun chofer, sin consultar rutas', async () => {
      // Distinguir "no sos chofer" de "no tenes ruta" solo le diria a quien
      // pregunta si ese identificador existe.
      choferes.buscarActivoPorUsuarioSub.mockResolvedValue(null);

      await expect(service.rutaActivaDeSesion('alguien-mas')).resolves.toBeNull();
      expect(rutas.buscarActivaDeChofer).not.toHaveBeenCalled();
    });
  });
});
