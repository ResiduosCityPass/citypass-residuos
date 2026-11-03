import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { RecepcionEdaService } from './recepcion-eda.service';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { ContingenciasService } from './contingencias.service';
import { CriticidadClimaticaService } from './criticidad-climatica.service';
import { EntregaEda } from '../domain/entrega-eda.entity';
import { CRITICIDAD_CONFIRMADA as START } from './dto/criticidad-climatica.dto';
import { crearInicioSimulacro, SIMULACRO_CONFIRMADO } from './simulacro-eda';

describe('Inbox transaccional de entregas EDA', () => {
  const envelope = () => ({
    data: { alertaId: randomUUID() },
    metadata: {
      eventId: randomUUID(),
      eventType: START,
      receivedAt: Date.now(),
      source: 'espacios-service',
      schemaId: 28,
      payloadHash: 'a'.repeat(64),
    },
  });
  const repo = { findOneBy: jest.fn(), save: jest.fn() };
  const climate = { recibir: jest.fn() };
  const lock = { bloquearOperacion: jest.fn() };
  let service: RecepcionEdaService;
  let settings: Record<string, string>;
  beforeEach(() => {
    jest.resetAllMocks();
    climate.recibir.mockResolvedValue({ duplicado: false });
    settings = {};
    service = new RecepcionEdaService(
      repo as unknown as Repository<EntregaEda>,
      {
        ejecutar: (f: () => Promise<unknown>) => f(),
        managerActual: () => null,
      } as ContextoTransaccional,
      lock as unknown as ContingenciasService,
      climate as unknown as CriticidadClimaticaService,
      new ConfigService(settings),
    );
  });
  it('guarda la metadata en la misma transaccion que la aplicacion del payload', async () => {
    const value = envelope();
    await service.procesar(START, START, 28, value);
    expect(climate.recibir).toHaveBeenCalledWith(START, value.data);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: value.metadata.eventId, metadata: value.metadata }),
    );
    const saved = repo.save.mock.calls[0][0];
    repo.findOneBy.mockResolvedValue(saved);
    expect(await service.procesar(START, START, 28, value)).toEqual({ duplicado: true });
    expect(climate.recibir).toHaveBeenCalledTimes(1);
    await expect(
      service.procesar(START, START, 28, { ...value, data: { alertaId: randomUUID() } }),
    ).rejects.toThrow('otro contenido');
  });
  it('propaga el fallo y no registra como procesado un payload rechazado', async () => {
    climate.recibir.mockRejectedValue(new Error('payload invalido'));
    await expect(service.procesar(START, START, 28, envelope())).rejects.toThrow(
      'payload invalido',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
  it.each(['eventType', 'eventId', 'source', 'payloadHash', 'schemaId', 'receivedAt'])(
    'rechaza metadata invalida: %s',
    async (field) => {
      const value = envelope();
      delete (value.metadata as Record<string, unknown>)[field];
      await expect(service.procesar(START, START, 28, value)).rejects.toThrow('Sobre EDA');
      expect(climate.recibir).not.toHaveBeenCalled();
    },
  );
  it('rechaza framing y tipos no climáticos aunque el sobre parezca valido', async () => {
    await expect(service.procesar(START, START, 99, envelope())).rejects.toThrow('Sobre EDA');
    await expect(
      service.procesar('com.citypass.otro.Evento', START, 28, envelope()),
    ).rejects.toThrow('Sobre EDA');
    await expect(service.procesar(START, START, 28, null)).rejects.toThrow('Sobre EDA');
  });
  it('recibe un simulacro opt-in, conserva su origen y lo deduplica por la entrega real', async () => {
    settings.EDA_CLIMA_SIMULACRO_ENABLED = 'true';
    const value = { ...envelope(), data: crearInicioSimulacro() };
    value.metadata.source = 'grupo6';
    value.metadata.eventType = SIMULACRO_CONFIRMADO;
    await service.procesar(START, SIMULACRO_CONFIRMADO + '.v2', 28, value);
    expect(climate.recibir).toHaveBeenCalledWith(START, value.data, 'eda-simulacro');
    repo.findOneBy.mockResolvedValue(repo.save.mock.calls[0][0]);
    expect(await service.procesar(START, SIMULACRO_CONFIRMADO, 28, value)).toEqual({
      duplicado: true,
    });
    expect(climate.recibir).toHaveBeenCalledTimes(1);
  });
  it.each(['deshabilitado', 'produccion', 'otra identidad', 'id real', 'actor real'])(
    'rechaza simulacros que no cumplen las condiciones: %s',
    async (condition) => {
      settings.EDA_CLIMA_SIMULACRO_ENABLED = condition === 'deshabilitado' ? 'false' : 'true';
      if (condition === 'produccion') settings.NODE_ENV = 'production';
      const value = { ...envelope(), data: crearInicioSimulacro() };
      value.metadata.eventType = SIMULACRO_CONFIRMADO;
      value.metadata.source = condition === 'otra identidad' ? 'otro-grupo' : 'grupo6';
      if (condition === 'id real') value.data.alertaId = randomUUID();
      if (condition === 'actor real') value.data.actorSub = 'delegado-esp';
      await expect(service.procesar(START, SIMULACRO_CONFIRMADO, 28, value)).rejects.toThrow(
        'Simulacro EDA',
      );
      expect(climate.recibir).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
});
