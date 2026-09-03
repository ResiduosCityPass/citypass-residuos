import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api, apiPublic, ApiError, saveToken, clearToken, readToken, seedDevToken } from './client.js';

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

  /* --- Token de desarrollo (VITE_DEV_TOKEN) ----------------------------- */

  describe('seedDevToken', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('siembra el token cuando no hay ninguno guardado', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt-admin');

      expect(seedDevToken('/mapa')).toBe(true);
      expect(readToken()).toBe('jwt-admin');
    });

    /** La pantalla del chofer exige rol CHOFER: el token de admin ahi da 403. */
    it('usa el token de chofer en /chofer', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt-admin');
      vi.stubEnv('VITE_DEV_TOKEN_CHOFER', 'jwt-chofer');

      expect(seedDevToken('/chofer')).toBe(true);
      expect(readToken()).toBe('jwt-chofer');
    });

    /**
     * El caso que rompia la app: quedaba pegado el token de chofer y todas las
     * demas pantallas devolvian 401 hasta borrarlo a mano. En desarrollo el
     * token es andamiaje, no una eleccion del usuario, asi que se pisa.
     */
    it('pisa un token que no corresponde a la pantalla', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt-admin');
      vi.stubEnv('VITE_DEV_TOKEN_CHOFER', 'jwt-chofer');
      saveToken('jwt-chofer');

      expect(seedDevToken('/mapa')).toBe(true);
      expect(readToken()).toBe('jwt-admin');
    });

    /** Si ya es el que corresponde, no reescribe ni avisa que cambio nada. */
    it('no hace nada si el token ya es el correcto', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt-admin');
      saveToken('jwt-admin');

      expect(seedDevToken('/mapa')).toBe(false);
      expect(readToken()).toBe('jwt-admin');
    });

    it('no hace nada si la variable no esta definida', () => {
      vi.stubEnv('VITE_DEV_TOKEN', '');

      expect(seedDevToken('/mapa')).toBe(false);
      expect(readToken()).toBe('');
    });

    /**
     * La condicion que importa: Vite pone DEV en false al compilar, asi que el
     * bloque no llega al bundle de produccion. Aca se simula esa compilacion.
     */
    it('no siembra nada fuera de desarrollo', () => {
      vi.stubEnv('DEV', false);
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt-admin');

      expect(seedDevToken('/mapa')).toBe(false);
      expect(readToken()).toBe('');
    });
  });
});
