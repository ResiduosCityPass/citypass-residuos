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

/**
 * La credencial que pega una persona vive en `sessionStorage`; los tokens de
 * desarrollo, en `localStorage`.
 *
 * Existe por un solo caso, el de CU-10: el chofer pega su credencial en el
 * celular y `seedDevToken` la pisaba en el render siguiente. Una credencial
 * manual tampoco debe quedar en `localStorage`: viene de un input y sobrevivir
 * al navegador cerrado es exactamente lo que no queremos de ella.
 *
 * `sessionStorage` es el punto justo entre las dos cosas: muere con la pestaña,
 * pero AGUANTA UN REFRESH. Con la credencial solo en memoria, que el chofer
 * recargue la pantalla obligaba a emitirle otra —no se puede volver a consultar
 * la que se emitio—, y emitir invalida la anterior.
 *
 * Puede no estar (modo privado, storage bloqueado): por eso `manualToken` sigue
 * siendo el espejo en memoria y cada acceso va envuelto. Sin storage la app
 * funciona igual, solo que la credencial no sobrevive al refresh.
 */
const TOKEN_SOURCE_KEY = 'citypass.token.origen';
let manualToken = '';

const readManual = () => {
  if (manualToken) return manualToken;
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

const writeManual = (token) => {
  manualToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin sessionStorage queda el espejo en memoria, que es como venia andando.
  }
};

export const readToken = () => readManual() || localStorage.getItem(TOKEN_KEY) || '';
export const tokenSource = () => (readManual() ? 'manual' : localStorage.getItem(TOKEN_SOURCE_KEY));

/** Guarda una credencial pegada por una persona mientras viva esta pestaña. */
export const saveToken = (token) => {
  writeManual(token.trim());
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_SOURCE_KEY);
};

function saveDevToken(token) {
  writeManual('');
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_SOURCE_KEY, 'dev');
};

export const clearToken = () => {
  writeManual('');
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_SOURCE_KEY);
};

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
 * La excepcion es /chofer con una credencial pegada a mano. Ahi el token dejo
 * de ser andamiaje: es COMO entra el chofer, la emite el operador desde el ABM
 * y no se puede volver a consultar. Pisarla obligaba a que se la emitieran de
 * nuevo, y ademas hacia imposible probar el flujo real en desarrollo. En el
 * resto del modulo se sigue pisando, que es lo que evita quedar en 401 por un
 * token de chofer olvidado.
 *
 * El precio, y es chico: en desarrollo, pasar por una pantalla del operador
 * reemplaza esa credencial por el token de admin, y al volver a /chofer se
 * siembra de nuevo el de desarrollo. Una credencial de verdad no sobrevive esa
 * vuelta. En produccion nada de esto existe.
 *
 * @param {string} pathname - Ruta actual. `/chofer` usa el token de CHOFER.
 * @returns {boolean} true si dejo un token puesto.
 */
export function seedDevToken(pathname = '') {
  if (!import.meta.env.DEV) return false;

  const esChofer = pathname.startsWith('/chofer');

  if (esChofer && readToken() && tokenSource() === 'manual') return false;

  const preset = esChofer
    ? import.meta.env.VITE_DEV_TOKEN_CHOFER
    : import.meta.env.VITE_DEV_TOKEN;

  if (!preset || readToken() === preset) return false;

  saveDevToken(preset);
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
