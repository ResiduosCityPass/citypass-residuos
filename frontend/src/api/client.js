/**
 * Cliente HTTP unico contra la API del modulo de Residuos.
 *
 * Dos responsabilidades, y ninguna mas:
 *  1. Poner el header Authorization: Bearer <jwt> en cada request.
 *  2. Normalizar los errores para que el resto de la app ramifique por `code`
 *     y nunca por el texto de `message` (que esta en castellano y puede cambiar).
 */

function trimRightSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function trimSlashes(value) {
  return String(value ?? '').replace(/^\/+|\/+$/g, '');
}

export function buildBaseUrl({
  apiUrl = import.meta.env.VITE_API_URL,
  apiOrigin = import.meta.env.VITE_API_ORIGIN,
  apiPrefix = import.meta.env.VITE_API_PREFIX ?? 'api/v1',
} = {}) {
  if (apiUrl) return trimRightSlash(apiUrl);

  const origin = trimRightSlash(apiOrigin);
  if (!origin) return 'http://localhost:3000/api/v1';

  const prefix = trimSlashes(apiPrefix);
  return prefix ? `${origin}/${prefix}` : origin;
}

const BASE_URL = buildBaseUrl();
const TOKEN_KEY = 'citypass.token';

export const readToken = () => localStorage.getItem(TOKEN_KEY) ?? '';
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token.trim());
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/**
 * Deja puesto el token de desarrollo que corresponde a la pantalla.
 *
 * Existe porque el login federado del Squad 2 recien llega en el Sprint 3
 * (ADR-005). Hasta entonces el token se fabrica con `npm run token:dev`, dura
 * 8 horas, y cada rol necesita el suyo: la pantalla del chofer solo la abre un
 * CHOFER, y el resto del modulo, un ADMINISTRADOR u OPERADOR. Elegirlo a mano
 * significaba pegar y despegar JWTs en una barra para moverse por la app.
 *
 * PISA el token guardado a proposito. La version anterior lo respetaba, y eso
 * dejaba la app trabada: bastaba pegar el token de chofer una vez para que
 * todas las demas pantallas quedaran en 401 hasta borrarlo a mano. En
 * desarrollo el token no es una decision del usuario, es andamiaje.
 *
 * Dos condiciones, y hacen falta las dos:
 *
 *  1. `import.meta.env.DEV`, que Vite pone en false al compilar. El bloque
 *     entero desaparece del bundle de produccion: no es una comprobacion que
 *     se pueda saltear, es codigo que no llega a existir.
 *  2. Que la variable este definida. No tiene valor por defecto y `.env.local`
 *     no se versiona, asi que un clon del repo no hereda el token de nadie.
 *
 * @param {string} pathname - Ruta actual. `/chofer` usa el token de CHOFER.
 * @returns {boolean} true si dejo un token puesto.
 */
export function seedDevToken(pathname = '') {
  if (!import.meta.env.DEV) return false;

  const esChofer = pathname.startsWith('/chofer');
  const preset = esChofer
    ? import.meta.env.VITE_DEV_TOKEN_CHOFER
    : import.meta.env.VITE_DEV_TOKEN;

  if (!preset || readToken() === preset) return false;

  saveToken(preset);
  return true;
}

/** Hay token de desarrollo configurado, asi que la barra manual sobra. */
export const usingDevToken = () =>
  Boolean(import.meta.env.DEV && import.meta.env.VITE_DEV_TOKEN);


/**
 * Error de API con el `code` estable del backend.
 *
 * `message` es el heredado de Error: texto ya redactado en castellano por el
 * backend y mostrable al usuario tal cual.
 *
 * @property {string} code - Codigo de negocio: ZONA_NO_ENCONTRADA, ALERTA_NO_ABIERTA, HTTP_401...
 * @property {number} status
 * @property {string[]|null} details - En HTTP_400, un mensaje por campo, sin unir.
 */
export class ApiError extends Error {
  constructor({ code, status, message, details = null }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    // Los formularios necesitan el array crudo para pintar el error debajo del
    // campo que lo causo. `message` ya viene unido y sirve para todo lo demas.
    this.details = details;
  }
}

/**
 * En los errores de validacion (HTTP_400) el backend manda `message` como
 * array de strings, uno por campo. En el resto, como string. Unificamos.
 */
function toText(message) {
  if (Array.isArray(message)) return message.join('. ');
  return message ?? 'Error inesperado';
}

async function request(path, options = {}) {
  // `anonymous` no es parte de RequestInit: se saca antes de llegar a fetch.
  const { anonymous = false, ...init } = options;
  const token = anonymous ? '' : readToken();

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // fetch solo rechaza si no hubo respuesta: backend caido, CORS, sin red.
    // El code queda en castellano a proposito: convive con los del backend en
    // el mismo `error.code` y meter un valor en ingles ahi seria peor.
    throw new ApiError({
      code: 'SIN_CONEXION',
      status: 0,
      message: 'No se pudo contactar la API. Verifica que el backend este corriendo en el puerto 3000.',
    });
  }

  if (response.status === 204) return null;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError({
      code: body?.code ?? `HTTP_${response.status}`,
      status: response.status,
      message: toText(body?.message),
      details: Array.isArray(body?.message) ? body.message : null,
    });
  }

  return body;
}

/** Arma un query string salteando los filtros vacios. */
function query(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') params.append(key, value);
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export const api = {
  get: (path, filters) => request(`${path}${query(filters)}`),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

/**
 * Endpoints marcados @Public() en el backend (ADR-005). Hoy solo CU-11.
 *
 * Existe como objeto aparte y no como una bandera de `api.get` para que la
 * unica forma de mandar una llamada sin token sea escribir la palabra en el
 * llamado: un tercer parametro posicional se pone en el lugar equivocado y
 * nadie lo nota. Que no exista `apiPublic.post` tambien es a proposito: la
 * vista ciudadana lee, no escribe.
 *
 * Sigue apuntando a BASE_URL. Si algun dia la vista ciudadana se despliega en
 * otro origen, hay que parametrizarlo aca.
 */
export const apiPublic = {
  get: (path, filters) => request(`${path}${query(filters)}`, { anonymous: true }),
};
