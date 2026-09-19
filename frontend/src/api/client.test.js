import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  api,
  apiPublic,
  ApiError,
  buildBaseUrl,
  saveToken,
  clearToken,
  readToken,
  seedDevToken,
} from './client.js';

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
    saveToken('un.jwt.valido');

    await api.get('/mapa/contenedores');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer un.jwt.valido');
  });

  it('no persiste en el navegador una credencial pegada manualmente', () => {
    saveToken('jwt.de.juana');

    expect(readToken()).toBe('jwt.de.juana');
    expect(localStorage.getItem('citypass.token')).toBeNull();
    expect(localStorage.getItem('citypass.token.origen')).toBeNull();
  });

  /**
   * Lo que entra por un input no se guarda tal cual. `saveToken` es el unico
   * lugar donde se puede atajar, porque es el unico que escribe en el storage:
   * si algo sin forma de JWT llega a guardarse, el sintoma recien aparece en la
   * request siguiente, como un 401 que se lee como falta de permisos y no como
   * "te falto pegar un pedazo".
   */
  describe('una credencial sin forma de JWT no se guarda', () => {
    const invalidas = [
      ['vacia', ''],
      ['solo espacios', '   '],
      ['media credencial', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'],
      ['sin la firma', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjaG9mZXJfYWJjIn0'],
      ['cortada justo en el punto', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjaG9mZXJfYWJjIn0.'],
      ['con un espacio en el medio', 'eyJhbGciOiJI UzI1NiJ9.eyJzdWIi.c2lnbmF0dXJl'],
      ['el comando en vez de su salida', 'npm run token:dev -- CHOFER'],
    ];

    it.each(invalidas)('rechaza %s y no deja nada en el storage', (_caso, valor) => {
      expect(saveToken(valor)).toBe(false);

      expect(readToken()).toBe('');
      expect(sessionStorage.getItem('citypass.token')).toBeNull();
    });

    /**
     * El caso caro, y el motivo por el que el rechazo tiene que ser lo primero
     * que hace la funcion: el chofer ya entro y pega algo cortado encima. Si un
     * valor rechazado pisara al anterior, se queda afuera sin forma de volver
     * —la credencial no se puede consultar de nuevo— y hay que emitirle otra,
     * que ademas rota el `usuarioSub` y mata cualquier copia que quedara viva.
     */
    it('no pisa la credencial que ya venia funcionando', () => {
      saveToken('jwt.de.juana');

      expect(saveToken('eyJhbGciOiJI')).toBe(false);
      expect(readToken()).toBe('jwt.de.juana');
    });

    /**
     * Una credencial de verdad: tres bloques base64url, con la firma HS256 de
     * 43 caracteres. Copiar y pegar en un celular arrastra espacios y un salto
     * de linea, y eso no puede contar como invalido.
     */
    it('acepta un JWT completo aunque venga con espacios alrededor', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiJjaG9mZXJfYWJjIiwidG9rZW5fdXNlIjoiY2hvZmVyLWludGVybm8ifQ.' +
        'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

      expect(saveToken(`  ${jwt}\n`)).toBe(true);
      expect(readToken()).toBe(jwt);
    });
  });

  /**
   * CU-10. La credencial no se puede volver a consultar y emitir otra invalida
   * la anterior, asi que si un refresh la perdiera, el chofer que recarga su
   * celular obliga a emitirle una nueva. Vive en `sessionStorage`: sobrevive al
   * refresh y muere con la pestaña.
   */
  it('la credencial pegada a mano sobrevive a una recarga de la pagina', async () => {
    saveToken('jwt.de.juana');
    expect(sessionStorage.getItem('citypass.token')).toBeTruthy();

    // Lo que hace un F5: el modulo se evalua de nuevo, la variable en memoria
    // arranca vacia y lo unico que queda es el storage.
    vi.resetModules();
    const recargado = await import('./client.js');

    expect(recargado.readToken()).toBe('jwt.de.juana');
    expect(recargado.tokenSource()).toBe('manual');
    expect(localStorage.getItem('citypass.token')).toBeNull();
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

  it('arma la URL base a partir del origen y el prefijo de Render', () => {
    expect(
      buildBaseUrl({
        apiUrl: '',
        apiOrigin: 'https://citypass-residuos-api.onrender.com/',
        apiPrefix: '/api/v1/',
      }),
    ).toBe('https://citypass-residuos-api.onrender.com/api/v1');
  });

  it('mantiene compatibilidad con VITE_API_URL', () => {
    expect(buildBaseUrl({ apiUrl: 'http://localhost:3000/api/v1/' })).toBe(
      'http://localhost:3000/api/v1',
    );
  });

  /**
   * CU-11 es la unica pantalla publica del modulo. La asercion que importa no
   * es que ande sin token: es que NO mande el header aunque haya uno guardado.
   * Un operador logueado que abre la vista ciudadana no tiene que filtrar su
   * identidad a un endpoint anonimo.
   */
  it('apiPublic no manda Authorization aunque haya un token guardado', async () => {
    const fetchMock = respond([]);
    saveToken('un.jwt.valido');

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
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt.de.admin');

      expect(seedDevToken('/mapa')).toBe(true);
      expect(readToken()).toBe('jwt.de.admin');
    });

    /** La pantalla del chofer exige rol CHOFER: el token de admin ahi da 403. */
    it('usa el token de chofer en /chofer', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt.de.admin');
      vi.stubEnv('VITE_DEV_TOKEN_CHOFER', 'jwt.de.chofer');

      expect(seedDevToken('/chofer')).toBe(true);
      expect(readToken()).toBe('jwt.de.chofer');
    });

    /**
     * `/choferes` es el ABM del operador y empieza con `/chofer`. Con un
     * `startsWith` a secas quedaba con el token de CHOFER y la pantalla entera
     * de CU-09 respondia 403, con cara de problema de permisos del backend.
     * No lo vio ningun test porque ninguno pasaba por ese pathname.
     */
    it('usa el token de admin en /choferes, que es el ABM del operador', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt.de.admin');
      vi.stubEnv('VITE_DEV_TOKEN_CHOFER', 'jwt.de.chofer');

      expect(seedDevToken('/choferes')).toBe(true);
      expect(readToken()).toBe('jwt.de.admin');
    });

    /**
     * El caso que rompia la app: quedaba pegado el token de chofer y todas las
     * demas pantallas devolvian 401 hasta borrarlo a mano. En desarrollo el
     * token es andamiaje, no una eleccion del usuario, asi que se pisa.
     */
    it('pisa un token que no corresponde a la pantalla', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt.de.admin');
      vi.stubEnv('VITE_DEV_TOKEN_CHOFER', 'jwt.de.chofer');
      saveToken('jwt.de.chofer');

      expect(seedDevToken('/mapa')).toBe(true);
      expect(readToken()).toBe('jwt.de.admin');
    });

    /** Si ya es el que corresponde, no reescribe ni avisa que cambio nada. */
    it('no hace nada si el token ya es el correcto', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt.de.admin');
      saveToken('jwt.de.admin');

      expect(seedDevToken('/mapa')).toBe(false);
      expect(readToken()).toBe('jwt.de.admin');
    });

    /**
     * La excepcion, y la razon de que exista `citypass.token.origen`: en /chofer
     * el token dejo de ser andamiaje. Es la credencial que le emitio el operador
     * desde el ABM, se muestra una sola vez y no se puede volver a consultar, asi
     * que pisarla obligaba a que se la emitieran de nuevo.
     */
    it('respeta en /chofer una credencial pegada a mano', () => {
      vi.stubEnv('VITE_DEV_TOKEN_CHOFER', 'jwt.de.chofer');
      saveToken('jwt.de.juana');

      expect(seedDevToken('/chofer')).toBe(false);
      expect(readToken()).toBe('jwt.de.juana');
    });

    /** Pero solo en /chofer: en el resto sigue siendo andamiaje que se pisa. */
    it('el resto del modulo pisa igual una credencial pegada a mano', () => {
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt.de.admin');
      saveToken('jwt.de.juana');

      expect(seedDevToken('/mapa')).toBe(true);
      expect(readToken()).toBe('jwt.de.admin');
    });

    /** Lo que siembra el andamiaje no es una credencial, y se pisa a si mismo. */
    it('un token sembrado por el andamiaje no se respeta', () => {
      vi.stubEnv('VITE_DEV_TOKEN_CHOFER', 'jwt-chofer-viejo');
      expect(seedDevToken('/chofer')).toBe(true);

      vi.stubEnv('VITE_DEV_TOKEN_CHOFER', 'jwt-chofer-nuevo');

      expect(seedDevToken('/chofer')).toBe(true);
      expect(readToken()).toBe('jwt-chofer-nuevo');
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
      vi.stubEnv('VITE_DEV_TOKEN', 'jwt.de.admin');

      expect(seedDevToken('/mapa')).toBe(false);
      expect(readToken()).toBe('');
    });
  });
});
