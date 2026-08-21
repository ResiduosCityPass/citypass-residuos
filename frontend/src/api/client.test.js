import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api, apiPublic, ApiError, saveToken, clearToken } from './client.js';

describe('cliente de la API', () => {
  beforeEach(() => {
    clearToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearToken();
  });

  const respond = (body, { status = 200 } = {}) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });

  it('manda el token en el header Authorization cuando hay uno guardado', async () => {
    const fetchMock = respond([]);
    saveToken('un-jwt');

    await api.get('/mapa/contenedores');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer un-jwt');
  });

  it('no manda el header si no hay token', async () => {
    const fetchMock = respond([]);

    await api.get('/zonas');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('saltea los filtros vacios al armar el query string', async () => {
    const fetchMock = respond([]);

    await api.get('/mapa/contenedores', { zonaId: 'abc', tipoResiduo: '', estado: undefined });

    expect(fetchMock.mock.calls[0][0]).toContain('/mapa/contenedores?zonaId=abc');
    expect(fetchMock.mock.calls[0][0]).not.toContain('tipoResiduo');
  });

  it('expone el `code` del backend, que es lo estable del contrato', async () => {
    respond(
      { statusCode: 409, code: 'ZONA_NOMBRE_DUPLICADO', message: 'Ya existe una zona' },
      { status: 409 },
    );

    await expect(api.post('/zonas', {})).rejects.toMatchObject({
      code: 'ZONA_NOMBRE_DUPLICADO',
      status: 409,
    });
  });

  it('unifica el `message` de validacion, que viene como array de strings', async () => {
    respond(
      { statusCode: 400, code: 'HTTP_400', message: ['lat must be a latitude', 'lng is required'] },
      { status: 400 },
    );

    await expect(api.post('/contenedores', {})).rejects.toThrow(
      'lat must be a latitude. lng is required',
    );
  });

  it('devuelve null en un 204 sin cuerpo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 204, json: async () => null });

    await expect(api.delete('/zonas/1')).resolves.toBeNull();
  });

  it('traduce la caida de red a un ErrorApi con code SIN_CONEXION', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await api.get('/zonas').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('SIN_CONEXION');
  });

  /**
   * CU-11 es la unica pantalla publica del modulo. La asercion que importa no
   * es que ande sin token: es que NO mande el header aunque haya uno guardado.
   * Un operador logueado que abre la vista ciudadana no tiene que filtrar su
   * identidad a un endpoint anonimo.
   */
  it('apiPublic no manda Authorization aunque haya un token guardado', async () => {
    const fetchMock = respond([]);
    saveToken('un-jwt');

    await apiPublic.get('/publico/contenedores/cercanos', { lat: -34.6, lng: -58.38 });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('apiPublic saltea los filtros vacios igual que api.get', async () => {
    const fetchMock = respond([]);

    await apiPublic.get('/publico/contenedores/cercanos', {
      lat: -34.6,
      lng: -58.38,
      tipoResiduo: '',
    });

    expect(fetchMock.mock.calls[0][0]).toMatch(/lat=-34.6&lng=-58.38$/);
  });

  it('`anonymous` no se filtra al fetch como opcion de RequestInit', async () => {
    const fetchMock = respond([]);

    await apiPublic.get('/publico/contenedores/cercanos');

    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('anonymous');
  });
});
