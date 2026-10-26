import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../../../shared/domain/domain-event';
import { InMemoryEventPublisher } from '../../../shared/events/in-memory.event-publisher';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { IntegracionRepository } from '../domain/integracion.repository';
import { Intervencion } from '../domain/intervencion.entity';
import { IntervencionRepository } from '../domain/intervencion.repository';
import { IntervencionesService } from './intervenciones.service';

// Un punto de la ciclovia de Palermo y contenedores a ~10 m, ~80 m y varios km.
const PUNTO = { lat: -34.5811, lng: -58.421 };
const contenedor = (id: string, lat: number, lng: number): Contenedor =>
  ({ id, codigo: id, lat, lng, activo: true }) as Contenedor;
const MUY_CERCA = contenedor('c-10m', -34.58119, -58.421);
const A_80M = contenedor('c-80m', -34.58182, -58.421);
const LEJOS = contenedor('c-lejos', -34.6186, -58.4421);

const datos = (cambios: Record<string, unknown> = {}) => ({
  emergenciaId: 'EMG-1',
  causasRelacionadas: ['RESIDUOS'],
  ubicacion: PUNTO,
  ...cambios,
});

describe('IntervencionesService (CU-01, A7)', () => {
  let repo: jest.Mocked<IntervencionRepository>;
  let integracion: { guardarRefuerzo: jest.Mock };
  let contenedores: { listar: jest.Mock };
  let eventos: InMemoryEventPublisher;
  let service: IntervencionesService;

  beforeEach(() => {
    repo = {
      crearSiNoExiste: jest
        .fn()
        .mockImplementation(async (i: Partial<Intervencion>) => ({ id: 'in-1', ...i })),
      listar: jest.fn(),
      buscar: jest.fn(),
    };
    integracion = { guardarRefuerzo: jest.fn().mockImplementation(async (r) => r) };
    contenedores = { listar: jest.fn().mockResolvedValue([LEJOS, A_80M, MUY_CERCA]) };
    eventos = new InMemoryEventPublisher();

    service = new IntervencionesService(
      repo,
      integracion as unknown as IntegracionRepository,
      contenedores as unknown as ContenedorRepository,
      eventos,
      new ConfigService({}),
    );
  });

  it('con RESIDUOS programa la intervencion en el contenedor mas cercano', async () => {
    await expect(service.programarSiCorresponde(datos())).resolves.toBe('programada');

    expect(repo.crearSiNoExiste).toHaveBeenCalledWith(
      expect.objectContaining({
        emergenciaId: 'EMG-1',
        lat: PUNTO.lat,
        lng: PUNTO.lng,
        contenedorId: 'c-10m',
      }),
    );
  });

  it.each([[['VIA']], [['ESPACIO_PUBLICO']], [[]], [undefined]])(
    'con causas %j no hace nada',
    async (causas) => {
      await expect(
        service.programarSiCorresponde(datos({ causasRelacionadas: causas })),
      ).resolves.toBe('sin_causa_residuos');

      expect(repo.crearSiNoExiste).not.toHaveBeenCalled();
      expect(eventos.getPublished()).toHaveLength(0);
    },
  );

  it('reconoce RESIDUOS entre varias causas y sin importar mayusculas', async () => {
    await expect(
      service.programarSiCorresponde(datos({ causasRelacionadas: ['VIA', 'residuos'] })),
    ).resolves.toBe('programada');
  });

  it('publica IntervencionProgramada con el emergenciaId como correlationId', async () => {
    await service.programarSiCorresponde(datos());

    const [evento] = eventos.getPublished(EventTypes.INTERVENCION_PROGRAMADA);
    expect(evento.correlationId).toBe('EMG-1');
    expect(evento.payload).toMatchObject({
      intervencionId: 'in-1',
      emergenciaId: 'EMG-1',
      contenedorId: 'c-10m',
      ubicacion: PUNTO,
    });
  });

  it('refuerza el contenedor para que la proxima ruta pase por ahi', async () => {
    await service.programarSiCorresponde(datos());

    expect(integracion.guardarRefuerzo).toHaveBeenCalledWith(
      expect.objectContaining({ eventoId: 'emergencia-EMG-1', contenedorIds: ['c-10m'] }),
    );
    expect(eventos.getPublished(EventTypes.REFUERZO_PROGRAMADO)).toHaveLength(1);
  });

  it('sin contenedor a menos de 50 m la intervencion se guarda igual, sin refuerzo', async () => {
    contenedores.listar.mockResolvedValue([LEJOS, A_80M]);

    await expect(service.programarSiCorresponde(datos())).resolves.toBe('programada');

    expect(repo.crearSiNoExiste).toHaveBeenCalledWith(
      expect.objectContaining({ contenedorId: null, distanciaMetros: null }),
    );
    expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
    expect(eventos.getPublished(EventTypes.REFUERZO_PROGRAMADO)).toHaveLength(0);
    expect(eventos.getPublished(EventTypes.INTERVENCION_PROGRAMADA)).toHaveLength(1);
  });

  it('la misma emergencia dos veces no duplica ni vuelve a publicar', async () => {
    repo.crearSiNoExiste.mockResolvedValue(null);

    await expect(service.programarSiCorresponde(datos())).resolves.toBe('duplicada');

    expect(eventos.getPublished()).toHaveLength(0);
    expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
  });

  it('acepta la ubicacion como latitud/longitud', async () => {
    await service.programarSiCorresponde(
      datos({ ubicacion: undefined, latitud: PUNTO.lat, longitud: PUNTO.lng }),
    );

    expect(repo.crearSiNoExiste).toHaveBeenCalledWith(
      expect.objectContaining({ lat: PUNTO.lat, lng: PUNTO.lng }),
    );
  });

  it.each([
    ['sin ubicacion', { ubicacion: undefined }],
    ['con coordenadas fuera de rango', { ubicacion: { lat: 200, lng: 0 } }],
    ['con coordenadas como texto', { ubicacion: { lat: '1', lng: '2' } }],
    ['sin emergenciaId', { emergenciaId: undefined }],
    ['con emergenciaId demasiado largo', { emergenciaId: 'x'.repeat(65) }],
  ])('un evento %s se ignora sin romper', async (_caso, cambios) => {
    await expect(service.programarSiCorresponde(datos(cambios))).resolves.toBe('ignorada');

    expect(repo.crearSiNoExiste).not.toHaveBeenCalled();
  });

  it('obtener lanza 404 si no existe', async () => {
    repo.buscar.mockResolvedValue(null);

    await expect(service.obtener('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listar devuelve lo que trae el repositorio', async () => {
    repo.listar.mockResolvedValue([{ id: 'in-1' } as Intervencion]);

    await expect(service.listar()).resolves.toEqual([{ id: 'in-1' }]);
  });
});
