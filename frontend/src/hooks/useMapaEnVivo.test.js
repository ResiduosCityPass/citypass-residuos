import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMapaEnVivo } from './useMapaEnVivo.js';
import { obtenerContenedoresDelMapa, obtenerAlertas } from '../api/residuos.js';

vi.mock('../api/residuos.js', () => ({
  obtenerContenedoresDelMapa: vi.fn(),
  obtenerAlertas: vi.fn(),
}));

const CONTENEDOR = {
  id: 'c-1',
  codigo: 'CT-0001',
  lat: -34.6,
  lng: -58.38,
  estado: 'NORMAL',
  tipoResiduo: 'COMUN',
  nivelLlenadoPct: 5,
  ultimaLecturaEn: '2026-08-20T22:50:02.199Z',
};

describe('useMapaEnVivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('trae contenedores e indexa las alertas de incendio por contenedor', async () => {
    obtenerContenedoresDelMapa.mockResolvedValue([CONTENEDOR]);
    obtenerAlertas.mockResolvedValue([{ id: 'a-1', contenedorId: 'c-1', tipo: 'INCENDIO' }]);

    const { result } = renderHook(() => useMapaEnVivo());

    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.contenedores).toHaveLength(1);
    // Un contenedor NORMAL (verde) puede tener un incendio abierto: el mapa tiene
    // que poder pintarlo aunque el color de estado no lo delate.
    expect(result.current.incendiosPorContenedor['c-1']).toBeDefined();
    expect(obtenerAlertas).toHaveBeenCalledWith({ tipo: 'INCENDIO', estado: 'ABIERTA' });
  });

  it('pasa los filtros al endpoint del mapa', async () => {
    obtenerContenedoresDelMapa.mockResolvedValue([]);
    obtenerAlertas.mockResolvedValue([]);

    renderHook(() => useMapaEnVivo({ zonaId: 'z-1', estado: 'CRITICO' }));

    await waitFor(() =>
      expect(obtenerContenedoresDelMapa).toHaveBeenCalledWith({
        zonaId: 'z-1',
        tipoResiduo: undefined,
        estado: 'CRITICO',
      }),
    );
  });

  it('guarda el error sin romper el render', async () => {
    obtenerContenedoresDelMapa.mockRejectedValue({ code: 'HTTP_401', mensaje: 'Falta el token' });
    obtenerAlertas.mockResolvedValue([]);

    const { result } = renderHook(() => useMapaEnVivo());

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error.code).toBe('HTTP_401');
    expect(result.current.contenedores).toEqual([]);
  });

  it('vuelve a pedir los datos cada intervalo, porque no hay WebSocket', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    obtenerContenedoresDelMapa.mockResolvedValue([CONTENEDOR]);
    obtenerAlertas.mockResolvedValue([]);

    renderHook(() => useMapaEnVivo({}, 30_000));
    await waitFor(() => expect(obtenerContenedoresDelMapa).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(obtenerContenedoresDelMapa).toHaveBeenCalledTimes(2);
  });

  it('deja de pedir datos al desmontarse', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    obtenerContenedoresDelMapa.mockResolvedValue([]);
    obtenerAlertas.mockResolvedValue([]);

    const { unmount } = renderHook(() => useMapaEnVivo({}, 30_000));
    await waitFor(() => expect(obtenerContenedoresDelMapa).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(obtenerContenedoresDelMapa).toHaveBeenCalledTimes(1);
  });
});
