import { api, apiPublic } from './client.js';

/**
 * Implementacion real contra la API del backend.
 *
 * No se importa desde las pantallas: se importa desde `waste.js`, que elige
 * entre esto y el servidor falso de `mocks/`. Las firmas y las formas que
 * devuelve estan tomadas de docs/arquitectura/guia-frontend.md, que son capturas
 * reales de la API corriendo.
 *
 * Los nombres de los campos, los valores de enum y las rutas quedan en
 * castellano porque son el contrato del backend, no codigo nuestro.
 */

/**
 * @typedef {Object} MapContainer
 * @property {string} id
 * @property {string} codigo             - CT-0001
 * @property {number} lat
 * @property {number} lng
 * @property {'NORMAL'|'ADVERTENCIA'|'CRITICO'|'FUERA_DE_SERVICIO'} estado
 * @property {'COMUN'|'RECICLABLE'|'ORGANICO'} tipoResiduo
 * @property {number} nivelLlenadoPct    - Ultima lectura, 2 decimales
 * @property {string|null} ultimaLecturaEn - null si nunca reporto
 */

/* --- CU-07 · Mapa ------------------------------------------------------- */

/** Payload flaco a proposito: solo lo necesario para pintar el marcador. */
export const fetchMapContainers = (filters) => api.get('/mapa/contenedores', filters);

/* --- CU-01 · Contenedores ----------------------------------------------- */

/** Listado completo. Mismos filtros que el mapa: zonaId, tipoResiduo, estado. */
export const fetchContainers = (filters) => api.get('/contenedores', filters);

/** Detalle con `zona` y `sensor` anidados. `sensor` es null si no tiene. */
export const fetchContainer = (id) => api.get(`/contenedores/${id}`);

/** Rol ADMINISTRADOR. Si `codigo` no va, el backend genera CT-0001, CT-0002... */
export const createContainer = (data) => api.post('/contenedores', data);

/** Rol ADMINISTRADOR. Solo los campos que cambian. El `codigo` no se puede modificar. */
export const updateContainer = (id, changes) => api.patch(`/contenedores/${id}`, changes);

/** Rol ADMINISTRADOR. Baja logica: la fila sobrevive porque su historico alimenta CU-12. */
export const deleteContainer = (id) => api.delete(`/contenedores/${id}`);

/** Rol ADMINISTRADOR. Devuelve la apiKey UNA SOLA VEZ: el backend guarda solo su hash. */
export const linkSensor = (id, data) => api.post(`/contenedores/${id}/sensor`, data);

/* --- CU-02 · Zonas ------------------------------------------------------ */

export const fetchZones = () => api.get('/zonas');
export const createZone = (data) => api.post('/zonas', data);
export const updateZone = (id, changes) => api.patch(`/zonas/${id}`, changes);

/** Ojo: el valor va como query param, no en el cuerpo. */
export const setZoneBlocked = (id, blocked) => api.patch(`/zonas/${id}/bloqueo?bloqueada=${blocked}`);

/** Falla con 409 ZONA_CON_CONTENEDORES si todavia tiene contenedores asignados. */
export const deleteZone = (id) => api.delete(`/zonas/${id}`);

/* --- CU-05 / CU-06 · Alertas -------------------------------------------- */

/** Ordenadas de mas reciente a mas antigua. Filtros: contenedorId, tipo, severidad, estado. */
export const fetchAlerts = (filters) => api.get('/alertas', filters);

/** Pasa la alerta a EN_ATENCION. Sin cuerpo. Falla con ALERTA_NO_ABIERTA si ya no esta ABIERTA. */
export const acknowledgeAlert = (id) => api.patch(`/alertas/${id}/atender`);

/** Cierra la alerta y sella resueltaEn. Falla con ALERTA_YA_RESUELTA si ya estaba cerrada. */
export const resolveAlert = (id) => api.patch(`/alertas/${id}/resolver`);

/* --- CU-12 · Prediccion de saturacion ----------------------------------- */

/**
 * Regresion lineal sobre el historico de lecturas. Devuelve `nivelActualPct`,
 * `tasaLlenadoPctPorHora`, `horasHastaUmbral`, `saturacionEstimadaEn`,
 * `confianza` y `muestrasUsadas`.
 *
 * Un contenedor sin lecturas no tiene de donde predecir.
 */
export const fetchPrediction = (id) => api.get(`/contenedores/${id}/prediccion`);

/* --- CU-03 · Flota ------------------------------------------------------ */

export const fetchTrucks = (filters) => api.get('/camiones', filters);
export const createTruck = (data) => api.post('/camiones', data);
export const updateTruck = (id, changes) => api.patch(`/camiones/${id}`, changes);

/* --- CU-08 / CU-09 · Rutas ---------------------------------------------- */

export const fetchRoutes = (filters) => api.get('/rutas', filters);
export const fetchRoute = (id) => api.get(`/rutas/${id}`);

/**
 * CU-08. Devuelve una ruta en estado PROPUESTA. **No la persiste como
 * asignada**: la separacion entre generar y asignar mantiene a una persona en
 * el medio, por si la heuristica nearest-neighbor propone algo absurdo.
 */
export const generateRoute = (data) => api.post('/rutas/generar', data);

/** CU-09. Confirma la propuesta, asigna chofer y pasa la ruta a ASIGNADA. */
export const assignRoute = (id, data) => api.patch(`/rutas/${id}/asignar`, data);

/**
 * Lista de choferes para el <select> de CU-09.
 *
 * NO EXISTE en el backend. Los choferes son usuarios con rol CHOFER del
 * directorio del Squad 2 (ADR-005) y nadie expuso todavia un endpoint para
 * listarlos. Queda mockeado y anotado como pedido de contrato.
 */
export const fetchDrivers = () => api.get('/choferes');

/* --- CU-10 · Mi ruta y confirmar vaciado -------------------------------- */

/**
 * La ruta activa del chofer AUTENTICADO. La identidad sale del sub del JWT, no
 * de un parametro: si el chofer viajara por query string, cualquiera podria
 * leer la ruta de otro cambiando un valor. La firma no toma argumentos a
 * proposito — si alguien le agrega `?choferId=`, abrio un agujero.
 *
 * PROPUESTA de contrato: api-preliminar.md documenta la ruta pero no la forma.
 * Se asume el mismo objeto expandido de GET /rutas/:id, o `null` con 200
 * cuando el chofer no tiene ruta activa. No tener ruta es el estado normal de
 * alguien que termino el turno, no un error, asi que no es un 404.
 */
export const fetchMyRoute = () => api.get('/rutas/mias');

/**
 * CU-10. El cuerpo es exactamente `{ lat, lng }`: el radio permitido es
 * configuracion del servidor, no algo que el cliente pueda mandar.
 *
 * Errores: 403 PARADA_FUERA_DE_RADIO (code PROPUESTO, ver domain/errors.js) y
 * 409 PARADA_YA_CONFIRMADA.
 */
export const confirmStop = (id, position) => api.patch(`/paradas/${id}/confirmar`, position);

/* --- CU-11 · Consulta ciudadana (publico, sin token) -------------------- */

/**
 * Unico endpoint del modulo que no manda Authorization: va por `apiPublic`.
 *
 * Filtros: { lat, lng, radioMetros, tipoResiduo }.
 *
 * PROPUESTA de contrato: la respuesta no esta especificada. Se asume el payload
 * de CU-07 menos `estado` y `nivelLlenadoPct` (informacion operativa interna),
 * mas `codigo` y `distanciaMetros`.
 */
export const fetchNearbyContainers = (filters) =>
  apiPublic.get('/publico/contenedores/cercanos', filters);
