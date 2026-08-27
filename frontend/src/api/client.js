/**
 * Cliente HTTP unico contra la API del modulo de Residuos.
 *
 * Dos responsabilidades, y ninguna mas:
 *  1. Poner el header Authorization: Bearer <jwt> en cada request.
 *  2. Normalizar los errores para que el resto de la app ramifique por `code`
 *     y nunca por el texto de `message` (que esta en castellano y puede cambiar).
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const TOKEN_KEY = 'citypass.token';

export const readToken = () => localStorage.getItem(TOKEN_KEY) ?? '';
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token.trim());
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

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
