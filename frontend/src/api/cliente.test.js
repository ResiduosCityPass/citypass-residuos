import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api, ErrorApi, guardarToken, borrarToken } from './cliente.js';

describe('cliente de la API', () => {
  beforeEach(() => {
    borrarToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    borrarToken();
  });

  const responder = (cuerpo, { status = 200 } = {}) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => cuerpo,
    });

  it('manda el token en el header Authorization cuando hay uno guardado', async () => {
    const fetchMock = responder([]);
    guardarToken('un-jwt');

    await api.get('/mapa/contenedores');

    const [, opciones] = fetchMock.mock.calls[0];
    expect(opciones.headers.Authorization).toBe('Bearer un-jwt');
  });

  it('no manda el header si no hay token', async () => {
    const fetchMock = responder([]);

    await api.get('/zonas');

    const [, opciones] = fetchMock.mock.calls[0];
    expect(opciones.headers.Authorization).toBeUndefined();
  });

  it('saltea los filtros vacios al armar el query string', async () => {
    const fetchMock = responder([]);

    await api.get('/mapa/contenedores', { zonaId: 'abc', tipoResiduo: '', estado: undefined });

    expect(fetchMock.mock.calls[0][0]).toContain('/mapa/contenedores?zonaId=abc');
    expect(fetchMock.mock.calls[0][0]).not.toContain('tipoResiduo');
  });

  it('expone el `code` del backend, que es lo estable del contrato', async () => {
    responder(
      { statusCode: 409, code: 'ZONA_NOMBRE_DUPLICADO', message: 'Ya existe una zona' },
      { status: 409 },
    );

    await expect(api.post('/zonas', {})).rejects.toMatchObject({
      code: 'ZONA_NOMBRE_DUPLICADO',
      status: 409,
    });
  });

  it('unifica el `message` de validacion, que viene como array de strings', async () => {
    responder(
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

    expect(error).toBeInstanceOf(ErrorApi);
    expect(error.code).toBe('SIN_CONEXION');
  });
});
