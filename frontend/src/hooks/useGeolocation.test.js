import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeolocation, GEO_STATUS } from './useGeolocation.js';

/**
 * jsdom no implementa navigator.geolocation: la propiedad no existe.
 *
 * Se define SOLO esa propiedad y no el navigator entero (vi.stubGlobal
 * rompe user-event, que lee clipboard y userAgent). Y se hace por archivo, no
 * en test/setup.js: si estuviera global, el camino UNAVAILABLE —que necesita
 * justamente que la API falte— no se podria probar nunca.
 */
const getCurrentPosition = vi.fn();

const install = () =>
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
  });

beforeEach(() => {
  vi.clearAllMocks();
  install();
});

afterEach(() => {
  delete globalThis.navigator.geolocation;
});

describe('useGeolocation', () => {
  it('arranca sin pedir nada', () => {
    const { result } = renderHook(() => useGeolocation());

    expect(result.current.status).toBe(GEO_STATUS.IDLE);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('devuelve la posicion cuando el navegador la concede', async () => {
    getCurrentPosition.mockImplementation((ok) =>
      ok({ coords: { latitude: -34.6, longitude: -58.38, accuracy: 12 } }),
    );
    const { result } = renderHook(() => useGeolocation());

    let resolved;
    await act(async () => {
      resolved = await result.current.request();
    });

    expect(result.current.status).toBe(GEO_STATUS.READY);
    expect(result.current.position).toEqual({ lat: -34.6, lng: -58.38, accuracyM: 12 });
    // Devuelve la posicion ademas de dejarla en el estado: eso es lo que le
    // permite a CU-10 pedir la ubicacion y confirmar con un solo tap.
    expect(resolved).toEqual({ lat: -34.6, lng: -58.38, accuracyM: 12 });
  });

  it('distingue el permiso denegado de cualquier otra falla', async () => {
    getCurrentPosition.mockImplementation((_, ko) => ko({ code: 1, message: 'denied' }));
    const { result } = renderHook(() => useGeolocation());

    let resolved;
    await act(async () => {
      resolved = await result.current.request();
    });

    expect(result.current.status).toBe(GEO_STATUS.DENIED);
    // Nunca rechaza: el que llama ramifica por el valor.
    expect(resolved).toBeNull();
    // El mensaje dice que hacer, no solo que fallo.
    expect(result.current.message).toMatch(/candado/i);
  });

  it('un timeout no es un permiso denegado', async () => {
    getCurrentPosition.mockImplementation((_, ko) => ko({ code: 3, message: 'timeout' }));
    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe(GEO_STATUS.ERROR);
  });

  it('avisa cuando el navegador directamente no tiene la API', async () => {
    delete globalThis.navigator.geolocation;
    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe(GEO_STATUS.UNAVAILABLE);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
