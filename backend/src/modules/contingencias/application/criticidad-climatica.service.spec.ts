import { randomUUID } from 'crypto';
import { CriticidadClimaticaService } from './criticidad-climatica.service';
import { ContingenciasService } from './contingencias.service';
import { AlertaClimaticaExterna } from '../domain/alerta-climatica.entity';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import {
  CRITICIDAD_CONFIRMADA as INICIO,
  CRITICIDAD_FINALIZADA as FIN,
} from './dto/criticidad-climatica.dto';
import { EVENTO_FIN, EVENTO_INICIO } from './dto/evento-inundacion.dto';

describe('Adaptacion de criticidad climatica de Espacios Publicos', () => {
  const id = randomUUID();
  const zone = randomUUID();
  const start = {
    alertaId: id,
    nivelCriticidad: 'ALTA',
    fenomeno: 'TORMENTA_FUERTE',
    ubicaciones: [{ latitud: -34.6037, longitud: -58.3816 }],
    vigenciaDesde: 1793311620000,
    vigenciaHasta: 1793333220000,
    actorSub: 'delegado-esp',
    temperaturaMinC: null,
    temperaturaMaxC: null,
  };
  const end = { alertaId: id, finalizadaEn: 1793333220000, actorSub: 'delegado-esp' };
  let saved: Map<string, AlertaClimaticaExterna>;
  let service: CriticidadClimaticaService;
  const contingencias = {
    simuladorHabilitado: jest.fn(),
    bloquearOperacion: jest.fn(),
    procesarEvento: jest.fn(),
    obtener: jest.fn(),
  };
  const repo = { buscar: jest.fn(), guardar: jest.fn(), listar: jest.fn() };
  beforeEach(() => {
    jest.resetAllMocks();
    saved = new Map();
    repo.buscar.mockImplementation(async (id: string) => structuredClone(saved.get(id) ?? null));
    repo.guardar.mockImplementation(async (a: AlertaClimaticaExterna) => {
      saved.set(a.alertaId, structuredClone(a));
      return a;
    });
    repo.listar.mockImplementation(async () => [...saved.values()]);
    contingencias.simuladorHabilitado.mockReturnValue(true);
    contingencias.obtener.mockResolvedValue({ zonas: [{ zonaId: zone }] });
    service = new CriticidadClimaticaService(
      repo,
      contingencias as unknown as ContingenciasService,
      {
        ejecutar: (fn: () => Promise<unknown>) => fn(),
      } as ContextoTransaccional,
    );
  });
  const suspend = () =>
    service.resolver(
      id,
      { accion: 'SUSPENDER', motivo: 'Inundacion verificada por el operador', zonaIds: [zone] },
      'operador-res',
    );

  it('conserva el payload sin inventar zonas ni suspender por un punto', async () => {
    await service.recibir(INICIO, start);
    const { alertas } = await service.listar();
    expect(alertas[0].confirmacion).toEqual(start);
    expect(alertas[0].decision).toBe('PENDIENTE_REVISION');
    expect(alertas[0].origen).toBe('eda');
    expect(contingencias.procesarEvento).not.toHaveBeenCalled();
  });
  it('deduplica por alerta y etapa aun si cambia el orden de las propiedades', async () => {
    await service.recibir(INICIO, start);
    const reordered = Object.fromEntries(Object.entries(start).reverse());
    expect((await service.recibir(INICIO, reordered)).duplicado).toBe(true);
    await expect(service.recibir(INICIO, { ...start, fenomeno: 'OTRO' })).rejects.toThrow(
      'otro contenido',
    );
    expect(saved.get(id)?.confirmacion?.fenomeno).toBe('TORMENTA_FUERTE');
  });
  it('deduplica el contrato anterior al materializar defaults Avro sin admitir cambios de cobertura', async () => {
    const { temperaturaMinC: _min, temperaturaMaxC: _max, ...legacy } = start;
    await service.recibir(INICIO, legacy);
    expect((await service.recibir(INICIO, { ...start, barrios: [] })).duplicado).toBe(true);
    await expect(service.recibir(INICIO, { ...start, barrios: ['SAN NICOLAS'] })).rejects.toThrow(
      'otro contenido',
    );
    expect(contingencias.procesarEvento).not.toHaveBeenCalled();
  });
  it('suspende solo las zonas elegidas y audita la decision', async () => {
    await service.recibir(INICIO, start);
    const a = await suspend();
    expect(a.revisadoPor).toBe('operador-res');
    expect(a.contingenciaId).toBeTruthy();
    expect(contingencias.procesarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: EVENTO_INICIO,
        payload: expect.objectContaining({ zonaIds: [zone], revision: 1 }),
      }),
    );
    await expect(suspend()).rejects.toThrow('ya fue revisada');
  });
  it('identifica la contingencia de simulacro y evita mezclar etapas con fuentes reales', async () => {
    await service.recibir(INICIO, start, 'eda-simulacro');
    await suspend();
    expect(contingencias.procesarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ descripcion: expect.stringContaining('SIMULACRO') }),
      }),
    );
    await expect(service.recibir(FIN, end)).rejects.toThrow('No se mezclan');
    await service.recibir(FIN, end, 'eda-simulacro');
    expect(saved.get(id)?.origen).toBe('eda-simulacro');
    const other = randomUUID();
    await service.recibir(INICIO, { ...start, alertaId: other });
    await expect(
      service.recibir(FIN, { ...end, alertaId: other }, 'eda-simulacro'),
    ).rejects.toThrow('No se mezclan');
  });
  it('el final real sin zonas libera hacia pendiente de recuperacion, una sola vez', async () => {
    await service.recibir(INICIO, start);
    await suspend();
    await service.recibir(FIN, end);
    await service.recibir(FIN, end);
    expect(contingencias.procesarEvento).toHaveBeenCalledTimes(2);
    expect(contingencias.procesarEvento).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: EVENTO_FIN,
        occurredAt: new Date(end.finalizadaEn).toISOString(),
        payload: expect.objectContaining({ zonaIds: [zone], revision: 2 }),
      }),
    );
  });
  it('conserva finales anticipados y no reactiva una alerta cerrada al recibir el inicio', async () => {
    await service.recibir(FIN, end);
    await expect(suspend()).rejects.toThrow('Falta recibir');
    await service.recibir(INICIO, start);
    expect(contingencias.procesarEvento).not.toHaveBeenCalled();
    await suspend();
    expect(contingencias.procesarEvento.mock.calls.map(([e]) => e.eventType)).toEqual([
      EVENTO_INICIO,
      EVENTO_FIN,
    ]);
  });
  it('permite descartar una alerta sin impacto y conserva el cierre posterior', async () => {
    await service.recibir(INICIO, start);
    await service.resolver(
      id,
      { accion: 'SIN_AFECTACION', motivo: 'No hay inundacion en nuestras zonas' },
      'operador-res',
    );
    await service.recibir(FIN, end);
    expect(saved.get(id)?.decision).toBe('SIN_AFECTACION');
    expect(contingencias.procesarEvento).not.toHaveBeenCalled();
  });
  it('exige zonas, vigencia y existencia de la alerta', async () => {
    await expect(suspend()).rejects.toThrow('No existe');
    await service.recibir(INICIO, start);
    await expect(
      service.resolver(id, { accion: 'SUSPENDER', motivo: 'Inundacion verificada' }, 'op'),
    ).rejects.toThrow('al menos una zona');
    await expect(
      service.resolver(
        id,
        { accion: 'SIN_AFECTACION', motivo: 'No corresponde', zonaIds: [zone] },
        'op',
      ),
    ).rejects.toThrow('no debe tener zonas');
    jest.spyOn(Date, 'now').mockReturnValue(start.vigenciaDesde - 1);
    await expect(suspend()).rejects.toThrow('aun no esta vigente');
    jest.restoreAllMocks();
  });
  it.each([
    null,
    [],
    42,
    {},
    { ...start, ubicaciones: [{ latitud: 100, longitud: 0 }] },
    { ...start, vigenciaDesde: '2026-10-29' },
    { ...start, vigenciaDesde: -1 },
    { ...start, barrios: [42] },
    { ...start, vigenciaHasta: start.vigenciaDesde - 1 },
  ])('rechaza contratos invalidos sin persistir', async (payload) => {
    await expect(service.recibir(INICIO, payload)).rejects.toThrow();
    expect(repo.guardar).not.toHaveBeenCalled();
  });
  it('rechaza un tipo desconocido y conflictos en el final', async () => {
    await expect(service.recibir('otro-evento', start)).rejects.toThrow('no soportado');
    await service.recibir(FIN, end);
    await expect(
      service.recibir(FIN, { ...end, finalizadaEn: end.finalizadaEn + 1 }),
    ).rejects.toThrow('otro contenido');
  });
  it('deshabilita el simulador en produccion sin deshabilitar la entrada del adaptador', async () => {
    contingencias.simuladorHabilitado.mockReturnValue(false);
    expect(() => service.simular({ tipo: INICIO, payload: start })).toThrow('deshabilitado');
    await expect(service.recibir(INICIO, start)).resolves.toBeDefined();
    contingencias.simuladorHabilitado.mockReturnValue(true);
    await service.simular({ tipo: FIN, payload: end });
  });
});
