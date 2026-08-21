import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLiveMap } from './useLiveMap.js';
import { fetchMapContainers, fetchAlerts } from '../api/waste.js';

vi.mock('../api/waste.js', () => ({
  fetchMapContainers: vi.fn(),
  fetchAlerts: vi.fn(),
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
};

describe('useLiveMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('trae contenedores e indexa las alertas de incendio por contenedor', async () => {
    fetchMapContainers.mockResolvedValue([CONTAINER]);
    fetchAlerts.mockResolvedValue([{ id: 'a-1', contenedorId: 'c-1', tipo: 'INCENDIO' }]);

    const { result } = renderHook(() => useLiveMap());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.containers).toHaveLength(1);
    // Un contenedor NORMAL (verde) puede tener un incendio abierto: el mapa tiene
    // que poder pintarlo aunque el color de estado no lo delate.
    expect(result.current.firesByContainer['c-1']).toBeDefined();
    expect(fetchAlerts).toHaveBeenCalledWith({ tipo: 'INCENDIO', estado: 'ABIERTA' });
  });

  it('pasa los filtros al endpoint del mapa', async () => {
    fetchMapContainers.mockResolvedValue([]);
    fetchAlerts.mockResolvedValue([]);

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
    fetchAlerts.mockResolvedValue([]);

    const { result } = renderHook(() => useLiveMap());

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error.code).toBe('HTTP_401');
    expect(result.current.containers).toEqual([]);
  });

  it('vuelve a pedir los datos cada intervalo, porque no hay WebSocket', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMapContainers.mockResolvedValue([CONTAINER]);
    fetchAlerts.mockResolvedValue([]);

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
    fetchAlerts.mockResolvedValue([]);

    const { unmount } = renderHook(() => useLiveMap({}, 30_000));
    await waitFor(() => expect(fetchMapContainers).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(fetchMapContainers).toHaveBeenCalledTimes(1);
  });
});
