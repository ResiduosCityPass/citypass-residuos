/**
 * Cliente HTTP unico contra la API del modulo de Residuos.
 *
 * Dos responsabilidades, y ninguna mas:
 *  1. Poner el header Authorization: Bearer <jwt> en cada request.
 *  2. Normalizar los errores para que el resto de la app ramifique por `code`
 *     y nunca por el texto de `message` (que esta en castellano y puede cambiar).
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const CLAVE_TOKEN = 'citypass.token';

export const leerToken = () => localStorage.getItem(CLAVE_TOKEN) ?? '';
export const guardarToken = (token) => localStorage.setItem(CLAVE_TOKEN, token.trim());
export const borrarToken = () => localStorage.removeItem(CLAVE_TOKEN);

/**
 * Error de API con el `code` estable del backend.
 * @property {string} code  - Codigo de negocio: ZONA_NO_ENCONTRADA, ALERTA_NO_ABIERTA, HTTP_401...
 * @property {number} status
 * @property {string} mensaje - Texto ya redactado en castellano, mostrable al usuario.
 */
export class ErrorApi extends Error {
  constructor({ code, status, mensaje }) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.code = code;
    this.status = status;
    this.mensaje = mensaje;
  }
}

/**
 * En los errores de validacion (HTTP_400) el backend manda `message` como
 * array de strings, uno por campo. En el resto, como string. Unificamos.
 */
function aTexto(message) {
  if (Array.isArray(message)) return message.join('. ');
  return message ?? 'Error inesperado';
}

async function pedir(ruta, opciones = {}) {
  const token = leerToken();

  let respuesta;
  try {
    respuesta = await fetch(`${BASE_URL}${ruta}`, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opciones.headers,
      },
    });
  } catch {
    // fetch solo rechaza si no hubo respuesta: backend caido, CORS, sin red.
    throw new ErrorApi({
      code: 'SIN_CONEXION',
      status: 0,
      mensaje: 'No se pudo contactar la API. Verifica que el backend este corriendo en el puerto 3000.',
    });
  }

  if (respuesta.status === 204) return null;

  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new ErrorApi({
      code: cuerpo?.code ?? `HTTP_${respuesta.status}`,
      status: respuesta.status,
      mensaje: aTexto(cuerpo?.message),
    });
  }

  return cuerpo;
}

/** Arma un query string salteando los filtros vacios. */
function query(filtros = {}) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params.append(clave, valor);
  }
  const cadena = params.toString();
  return cadena ? `?${cadena}` : '';
}

export const api = {
  get: (ruta, filtros) => pedir(`${ruta}${query(filtros)}`),
  post: (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo ?? {}) }),
  patch: (ruta, cuerpo) => pedir(ruta, { method: 'PATCH', body: JSON.stringify(cuerpo ?? {}) }),
  delete: (ruta) => pedir(ruta, { method: 'DELETE' }),
};
