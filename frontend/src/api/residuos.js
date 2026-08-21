import { api } from './cliente.js';

/**
 * Endpoints del modulo. Los tipos van en JSDoc: son comentarios, no cambian el
 * build, pero el editor te autocompleta los nombres de campo (que son muchos
 * y estan en castellano).
 */

/**
 * @typedef {Object} ContenedorMapa
 * @property {string} id
 * @property {string} codigo             - CT-0001
 * @property {number} lat
 * @property {number} lng
 * @property {'NORMAL'|'ADVERTENCIA'|'CRITICO'|'FUERA_DE_SERVICIO'} estado
 * @property {'COMUN'|'RECICLABLE'|'ORGANICO'} tipoResiduo
 * @property {number} nivelLlenadoPct    - Ultima lectura, 2 decimales
 * @property {string|null} ultimaLecturaEn - null si nunca reporto
 */

/**
 * CU-07. Payload flaco a proposito: solo lo necesario para pintar el marcador.
 * Nunca devuelve contenedores dados de baja.
 * @param {{zonaId?: string, tipoResiduo?: string, estado?: string}} [filtros]
 * @returns {Promise<ContenedorMapa[]>}
 */
export const obtenerContenedoresDelMapa = (filtros) => api.get('/mapa/contenedores', filtros);

/** CU-01. Detalle con `zona` y `sensor` anidados. `sensor` es null si no tiene. */
export const obtenerContenedor = (id) => api.get(`/contenedores/${id}`);

/** CU-02. Llena el <select> de zonas y da los umbrales para la barra de progreso. */
export const obtenerZonas = () => api.get('/zonas');

/**
 * CU-05 / CU-06. Ordenadas de mas reciente a mas antigua.
 * @param {{contenedorId?: string, tipo?: string, severidad?: string, estado?: string}} [filtros]
 */
export const obtenerAlertas = (filtros) => api.get('/alertas', filtros);

/** Pasa la alerta a EN_ATENCION. Sin cuerpo. Falla con ALERTA_NO_ABIERTA si ya no esta ABIERTA. */
export const atenderAlerta = (id) => api.patch(`/alertas/${id}/atender`);

/** Cierra la alerta y sella resueltaEn. Falla con ALERTA_YA_RESUELTA si ya estaba cerrada. */
export const resolverAlerta = (id) => api.patch(`/alertas/${id}/resolver`);
