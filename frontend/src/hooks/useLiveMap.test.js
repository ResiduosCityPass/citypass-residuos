import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLiveMap } from './useLiveMap.js';
import { fetchMapContainers } from '../api/waste.js';

vi.mock('../api/waste.js', () => ({
  fetchMapContainers: vi.fn(),
}));

const CONTAINER = {
  id: 'c-1',
  codigo: 'CT-0001',
  lat: -34.6,
  lng: -58.38,
  estado: 'NORMAL',
  tipoResiduo: 'COMUN',
  nivelLlenadoPct: 5,
  ultimaLecturaEn: '2026-08-20T22:50:02.199Z',
  zonaNombre: 'Centro',
  umbralCriticoPct: 70,
  incendioActivo: true,
};

describe('useLiveMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resuelve el mapa con una sola llamada, incendio incluido', async () => {
    fetchMapContainers.mockResolvedValue([CONTAINER]);

    const { result } = renderHook(() => useLiveMap());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.containers).toHaveLength(1);
    // Un contenedor NORMAL (verde) puede tener un incendio abierto: el estado
    // refleja el llenado y el incendio la temperatura. Antes eso obligaba a una
    // segunda llamada a /alertas en cada refresco; ahora viene en el payload.
    expect(result.current.containers[0].incendioActivo).toBe(true);
    expect(fetchMapContainers).toHaveBeenCalledTimes(1);
  });

  it('pasa los filtros al endpoint del mapa', async () => {
    fetchMapContainers.mockResolvedValue([]);

    renderHook(() => useLiveMap({ zonaId: 'z-1', estado: 'CRITICO' }));

    await waitFor(() =>
      expect(fetchMapContainers).toHaveBeenCalledWith({
        zonaId: 'z-1',
        tipoResiduo: undefined,
        estado: 'CRITICO',
      }),
    );
  });

  it('guarda el error sin romper el render', async () => {
    fetchMapContainers.mockRejectedValue({ code: 'HTTP_401', message: 'Falta el token' });

    const { result } = renderHook(() => useLiveMap());

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error.code).toBe('HTTP_401');
    expect(result.current.containers).toEqual([]);
  });

  it('vuelve a pedir los datos cada intervalo, porque no hay WebSocket', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMapContainers.mockResolvedValue([CONTAINER]);

    renderHook(() => useLiveMap({}, 30_000));
    await waitFor(() => expect(fetchMapContainers).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(fetchMapContainers).toHaveBeenCalledTimes(2);
  });

  it('deja de pedir datos al desmontarse', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMapContainers.mockResolvedValue([]);

    const { unmount } = renderHook(() => useLiveMap({}, 30_000));
    await waitFor(() => expect(fetchMapContainers).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(fetchMapContainers).toHaveBeenCalledTimes(1);
  });
});
