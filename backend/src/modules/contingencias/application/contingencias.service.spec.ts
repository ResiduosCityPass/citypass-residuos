import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { InMemoryEventPublisher } from '../../../shared/events/in-memory.event-publisher';
import { EventTypes } from '../../../shared/domain/domain-event';
import { EstadoParada, EstadoRuta } from '../../../shared/domain/enums';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { Ruta } from '../../rutas/domain/ruta.entity';
import { Zona } from '../../zonas/domain/zona.entity';
import { Contingencia, EstadoContingencia } from '../domain/contingencia.entity';
import { ContingenciaRepository } from '../domain/contingencia.repository';
import { EVENTO_FIN, EVENTO_INICIO } from './dto/evento-inundacion.dto';
import { ContingenciasService } from './contingencias.service';

const ZONA = randomUUID();
const CONTENEDOR = randomUUID();
const evento = (id = randomUUID(), revision = 1, tipo = EVENTO_INICIO) => ({
  eventId: randomUUID(),
  eventType: tipo,
  source: 'espaciospublicos-service',
  occurredAt: '2026-10-19T14:00:00.000Z',
  version: 1,
  correlationId: id,
  payload: { inundacionId: id, revision, descripcion: 'Inundacion Centro', zonaIds: [ZONA] },
});

describe('ContingenciasService', () => {
  let repo: jest.Mocked<ContingenciaRepository>;
  let service: ContingenciasService;
  let eventos: InMemoryEventPublisher;
  let registros: Map<string, Contingencia>;
  let recibidos: Map<string, { huella: string }>;

  beforeEach(() => {
    registros = new Map();
    recibidos = new Map();
    repo = {
      bloquearOperacion: jest.fn().mockResolvedValue(undefined),
      buscar: jest.fn().mockImplementation(async (id) => registros.get(id) ?? null),
      listar: jest.fn().mockImplementation(async () => [...registros.values()]),
      guardar: jest.fn().mockImplementation(async (c) => {
        const guardada = { ...registros.get(c.id!), ...c } as Contingencia;
        registros.set(c.id!, guardada);
        return guardada;
      }),
      registrarZonas: jest.fn().mockImplementation(async (id, ids: string[]) => {
        registros.get(id)!.zonas = ids.map((zonaId) => ({ contingenciaId: id, zonaId }));
      }),
      registrarImpactos: jest.fn().mockImplementation(async (id) => {
        const c = registros.get(id)!;
        c.contenedores ??= [{ contingenciaId: id, contenedorId: CONTENEDOR, vaciadoEn: null }];
      }),
      zonasBloqueadasManualmente: jest.fn().mockResolvedValue([]),
      zonasExistentes: jest.fn().mockImplementation(async (ids) => ids.length),
      zonaTieneHistorial: jest.fn().mockResolvedValue(false),
      eventoProcesado: jest.fn().mockImplementation(async (id) => recibidos.get(id) ?? null),
      registrarEvento: jest.fn().mockImplementation(async (id, huella) => {
        recibidos.set(id, { huella });
      }),
      restricciones: jest.fn().mockImplementation(async () =>
        [...registros.values()]
          .filter((c) =>
            [EstadoContingencia.ACTIVA, EstadoContingencia.PENDIENTE_RECUPERACION].includes(
              c.estado,
            ),
          )
          .flatMap((c) =>
            c.zonas!.map((z) => ({
              zonaId: z.zonaId,
              contingenciaId: c.id,
              descripcion: c.descripcion,
              estado: c.estado,
            })),
          ),
      ),
      pendientesDeRecuperacion: jest.fn().mockResolvedValue([CONTENEDOR]),
      marcarVaciado: jest.fn().mockImplementation(async (contenedorId, fecha) =>
        [...registros.values()]
          .filter(
            (c) =>
              c.estado === EstadoContingencia.EN_RECUPERACION &&
              c.contenedores?.some((cc) => cc.contenedorId === contenedorId && !cc.vaciadoEn),
          )
          .map((c) => {
            c.contenedores!.filter((cc) => cc.contenedorId === contenedorId).forEach((cc) => {
              cc.vaciadoEn = fecha;
            });
            return c.id;
          }),
      ),
      contarPendientes: jest
        .fn()
        .mockImplementation(
          async (id) => registros.get(id)!.contenedores!.filter((cc) => !cc.vaciadoEn).length,
        ),
      paradasPendientes: jest.fn().mockResolvedValue([]),
    };
    eventos = new InMemoryEventPublisher();
    service = new ContingenciasService(
      repo,
      eventos,
      { ejecutar: (f: () => Promise<unknown>) => f() } as ContextoTransaccional,
      new ConfigService({ NODE_ENV: 'test' }),
    );
  });

  it('registra la restriccion y el trabajo pendiente sin modificar el contenedor', async () => {
    const e = evento();
    const result = await service.procesarEvento(e);
    expect(result.contingencia).toMatchObject({ id: e.payload.inundacionId, estado: 'ACTIVA' });
    expect(await service.restricciones()).toHaveLength(1);
    expect(repo.registrarImpactos).toHaveBeenCalledWith(e.payload.inundacionId, [ZONA]);
    expect(eventos.getPublished(EventTypes.SERVICIO_AFECTADO)[0].correlationId).toBe(
      e.correlationId,
    );
    expect(repo.bloquearOperacion).toHaveBeenCalledTimes(1);
  });

  it('deduplica el mismo evento y no vuelve a publicar efectos', async () => {
    const e = evento();
    await service.procesarEvento(e);
    expect((await service.procesarEvento(e)).duplicado).toBe(true);
    expect(repo.registrarImpactos).toHaveBeenCalledTimes(1);
    expect(eventos.getPublished(EventTypes.SERVICIO_AFECTADO)).toHaveLength(1);
  });

  it('rechaza reutilizar un eventId con distinto contenido', async () => {
    const e = evento();
    await service.procesarEvento(e);
    await expect(
      service.procesarEvento({ ...e, payload: { ...e.payload, descripcion: 'Otra tormenta' } }),
    ).rejects.toThrow(ConflictException);
  });

  it.each([
    null,
    undefined,
    [],
    'texto',
    4,
    {},
    { ...evento(), version: 2 },
    { ...evento(), payload: {} },
    { ...evento(), payload: null },
    { ...evento(), payload: { ...evento().payload, zonaIds: [] } },
    { ...evento(), source: 'desconocido' },
    { ...evento(), campoExtra: true },
  ])('valida el contrato antes de escribir: %p', async (e) => {
    await expect(service.procesarEvento(e)).rejects.toThrow(BadRequestException);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('rechaza zonas desconocidas sin registrar el mensaje como procesado', async () => {
    repo.zonasExistentes.mockResolvedValue(0);
    await expect(service.procesarEvento(evento())).rejects.toThrow(BadRequestException);
    expect(repo.registrarEvento).not.toHaveBeenCalled();
  });

  it('mantiene las zonas inmutables en el contrato v1', async () => {
    const e = evento();
    await service.procesarEvento(e);
    await expect(
      service.procesarEvento({
        ...evento(e.payload.inundacionId, 2),
        payload: { ...e.payload, revision: 2, zonaIds: [randomUUID()] },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('ignora revisiones anteriores aunque tengan otro eventId', async () => {
    const e = evento();
    await service.procesarEvento(e);
    const fin = evento(e.payload.inundacionId, 2, EVENTO_FIN);
    await service.procesarEvento(fin);
    expect((await service.procesarEvento({ ...e, eventId: randomUUID() })).ignorado).toBe(true);
    expect((await service.obtener(e.payload.inundacionId)).estado).toBe('PENDIENTE_RECUPERACION');
  });

  it('acepta la finalizacion antes del inicio y el inicio retrasado no reactiva', async () => {
    const id = randomUUID();
    await service.procesarEvento(evento(id, 2, EVENTO_FIN));
    await service.procesarEvento(evento(id));
    expect((await service.obtener(id)).estado).toBe('PENDIENTE_RECUPERACION');
    expect(await service.restricciones()).toHaveLength(1);
  });

  it('la finalizacion no habilita la recoleccion automaticamente', async () => {
    const e = evento();
    await service.procesarEvento(e);
    await service.procesarEvento(evento(e.payload.inundacionId, 2, EVENTO_FIN));
    await expect(service.exigirZonaHabilitada(ZONA)).rejects.toThrow(ConflictException);
    expect(eventos.getPublished(EventTypes.RECUPERACION_PENDIENTE)).toHaveLength(1);
  });

  it('otra finalizacion no vuelve a emitir la transicion', async () => {
    const id = randomUUID();
    await service.procesarEvento(evento(id, 2, EVENTO_FIN));
    await service.procesarEvento(evento(id, 3, EVENTO_FIN));
    expect(eventos.getPublished(EventTypes.RECUPERACION_PENDIENTE)).toHaveLength(1);
  });

  it('no habilita recuperacion durante la inundacion', async () => {
    const e = evento();
    await service.procesarEvento(e);
    await expect(service.habilitarRecuperacion(e.payload.inundacionId)).rejects.toThrow(
      ConflictException,
    );
  });

  it('habilitar recuperacion retira solo la restriccion propia y conserva el bloqueo manual', async () => {
    const id = randomUUID();
    const otra = randomUUID();
    await service.procesarEvento(evento(id, 2, EVENTO_FIN));
    await service.procesarEvento(evento(otra));
    await service.habilitarRecuperacion(id);
    const [z] = await service.decorarZonas([{ id: ZONA, bloqueada: true } as Zona]);
    expect(z.bloqueada).toBe(true);
    expect(z.restriccionesInundacion!.map((r) => r.contingenciaId)).toEqual([otra]);
    await expect(service.exigirZonaHabilitada(ZONA)).rejects.toThrow(ConflictException);
  });

  it('habilita la recoleccion pero no da por vaciados los contenedores', async () => {
    const id = randomUUID();
    await service.procesarEvento(evento(id, 2, EVENTO_FIN));
    const c = await service.habilitarRecuperacion(id);
    expect(c.estado).toBe('EN_RECUPERACION');
    expect(c.contenedores![0].vaciadoEn).toBeNull();
    await expect(service.exigirZonaHabilitada(ZONA)).resolves.toBeUndefined();
    expect(await service.pendientesDeRecuperacion()).toEqual([CONTENEDOR]);
    expect(eventos.getPublished(EventTypes.SERVICIO_RESTABLECIDO)).toHaveLength(0);
  });

  it('habilitar dos veces no repite efectos ni reinicia el progreso', async () => {
    const id = randomUUID();
    await service.procesarEvento(evento(id, 2, EVENTO_FIN));
    await service.habilitarRecuperacion(id);
    await service.habilitarRecuperacion(id);
    expect(eventos.getPublished(EventTypes.RECUPERACION_HABILITADA)).toHaveLength(1);
    expect(repo.registrarImpactos).toHaveBeenCalledTimes(2);
  });

  it('solo los vaciados efectivos completan y publican la recuperacion', async () => {
    const id = randomUUID();
    await service.procesarEvento(evento(id, 2, EVENTO_FIN));
    await service.habilitarRecuperacion(id);
    await service.registrarVaciado(CONTENEDOR, new Date());
    expect((await service.obtener(id)).estado).toBe('RECUPERADA');
    expect(eventos.getPublished(EventTypes.SERVICIO_RESTABLECIDO)).toHaveLength(1);
    await service.registrarVaciado(CONTENEDOR, new Date());
    expect(eventos.getPublished(EventTypes.SERVICIO_RESTABLECIDO)).toHaveLength(1);
  });

  it('no cierra si aun falta otro contenedor', async () => {
    const id = randomUUID();
    await service.procesarEvento(evento(id, 2, EVENTO_FIN));
    registros
      .get(id)!
      .contenedores!.push({ contingenciaId: id, contenedorId: randomUUID(), vaciadoEn: null });
    await service.habilitarRecuperacion(id);
    await service.registrarVaciado(CONTENEDOR, new Date());
    expect((await service.obtener(id)).estado).toBe('EN_RECUPERACION');
  });

  it('sin trabajo pendiente se recupera al habilitar y una finalizacion tardia no lo revierte', async () => {
    const id = randomUUID();
    await service.procesarEvento(evento(id, 2, EVENTO_FIN));
    registros.get(id)!.contenedores = [];
    await service.habilitarRecuperacion(id);
    await service.procesarEvento(evento(id, 3, EVENTO_FIN));
    expect((await service.obtener(id)).estado).toBe('RECUPERADA');
    await expect(service.procesarEvento(evento(id, 4))).rejects.toThrow(ConflictException);
  });

  it('decora solo paradas pendientes de rutas vivas y agrega el resumen del listado', async () => {
    const id = randomUUID();
    await service.procesarEvento(evento(id));
    repo.paradasPendientes.mockResolvedValue([{ id: 'p1', zonaId: ZONA, rutaId: 'r1' }]);
    const paradas = [
      { id: 'p1', estado: EstadoParada.PENDIENTE },
      { id: 'p2', estado: EstadoParada.CONFIRMADA },
    ];
    const [r] = await service.decorarRutas([
      { id: 'r1', estado: EstadoRuta.EN_CURSO, paradas } as Ruta,
    ]);
    expect(r.paradasSuspendidas).toBe(1);
    expect(r.contingenciaIds).toEqual([id]);
    expect(r.paradas![0].restriccionesInundacion).toHaveLength(1);
    expect(r.paradas![1].restriccionesInundacion).toEqual([]);
    expect(await service.decorarRutas([])).toEqual([]);
    repo.paradasPendientes.mockResolvedValue([]);
    await service.decorarRutas([{ id: 'r2', estado: EstadoRuta.COMPLETADA } as Ruta]);
    expect(repo.paradasPendientes).toHaveBeenLastCalledWith([]);
  });

  it('devuelve 404 para una contingencia desconocida', async () => {
    await expect(service.obtener(randomUUID())).rejects.toThrow(NotFoundException);
  });

  it('el bloqueo manual sigue impidiendo confirmar despues de habilitar recuperacion', async () => {
    repo.zonasBloqueadasManualmente.mockResolvedValue([ZONA]);
    await expect(service.exigirZonaHabilitada(ZONA)).rejects.toThrow(ConflictException);
    repo.paradasPendientes.mockResolvedValue([{ id: 'p1', rutaId: 'r1', zonaId: ZONA }]);
    const [r] = await service.decorarRutas([
      {
        id: 'r1',
        estado: EstadoRuta.ASIGNADA,
        paradas: [{ id: 'p1', estado: EstadoParada.PENDIENTE }],
      } as Ruta,
    ]);
    expect(r.paradasBloqueadasManualmente).toBe(1);
    expect(r.paradas![0].bloqueoManual).toBe(true);
  });

  it('el simulador entra por el mismo procesador y soporta ambos eventos', async () => {
    const inicio = await service.simularInicio({
      descripcion: 'Inundacion de prueba',
      zonaIds: [ZONA],
    });
    const fin = await service.simularFinalizacion(inicio.contingencia.id);
    expect(fin.contingencia.estado).toBe('PENDIENTE_RECUPERACION');
    expect((await service.listar()).contingencias).toHaveLength(1);
    expect(await service.zonaTieneHistorial(ZONA)).toBe(false);
  });

  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: 'production', CLIMA_SIMULADOR_HABILITADO: 'true' },
    { NODE_ENV: 'development', CLIMA_SIMULADOR_HABILITADO: 'false' },
  ])('deshabilita el simulador con %p', async (config) => {
    service = new ContingenciasService(
      repo,
      eventos,
      {} as ContextoTransaccional,
      new ConfigService(config),
    );
    expect(service.simuladorHabilitado()).toBe(false);
    expect((await service.listar()).simuladorHabilitado).toBe(false);
    expect(() => service.simularInicio({ descripcion: 'Prueba', zonaIds: [ZONA] })).toThrow(
      NotFoundException,
    );
    await expect(service.simularFinalizacion(randomUUID())).rejects.toThrow(NotFoundException);
    expect(repo.guardar).not.toHaveBeenCalled();
  });
});
