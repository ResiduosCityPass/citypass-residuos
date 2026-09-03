import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { hashearApiKey } from '../../modules/contenedores/domain/api-key';
import { Sensor } from '../../modules/contenedores/domain/sensor.entity';
import { SensorRepository } from '../../modules/contenedores/domain/sensor.repository';
import { SensorKeyGuard } from './sensor-key.guard';

describe('SensorKeyGuard', () => {
  let sensores: jest.Mocked<SensorRepository>;
  let guard: SensorKeyGuard;

  const contextoCon = (headers: Record<string, string> = {}) => {
    const request: Record<string, unknown> = { headers };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  beforeEach(() => {
    sensores = {
      crear: jest.fn(),
      guardar: jest.fn(),
      buscarPorContenedor: jest.fn(),
      buscarPorCodigo: jest.fn(),
      buscarPorApiKeyHash: jest.fn(),
      contar: jest.fn(),
    };
    guard = new SensorKeyGuard(sensores);
  });

  it('rechaza cuando no viene el header', async () => {
    const { context } = contextoCon();

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una api key que no corresponde a ningun sensor', async () => {
    sensores.buscarPorApiKeyHash.mockResolvedValue(null);
    const { context } = contextoCon({ 'x-sensor-key': 'clave-inventada' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('busca por el hash de la clave, nunca por la clave en claro', async () => {
    sensores.buscarPorApiKeyHash.mockResolvedValue({ id: 's-1' } as Sensor);
    const { context } = contextoCon({ 'x-sensor-key': 'clave-real' });

    await guard.canActivate(context);

    expect(sensores.buscarPorApiKeyHash).toHaveBeenCalledWith(hashearApiKey('clave-real'));
    expect(sensores.buscarPorApiKeyHash).not.toHaveBeenCalledWith('clave-real');
  });

  it('adjunta el sensor autenticado al request', async () => {
    const sensor = { id: 's-1', codigo: 'SN-0001' } as Sensor;
    sensores.buscarPorApiKeyHash.mockResolvedValue(sensor);
    const { context, request } = contextoCon({ 'x-sensor-key': 'clave-real' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.sensor).toBe(sensor);
  });
});
