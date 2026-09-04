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
 * @property {string} zonaNombre         - Para el tooltip del marcador
 * @property {number} umbralCriticoPct   - Umbral de su zona, para la marca de la barra
 * @property {boolean} incendioActivo    - Independiente del `estado`: uno NORMAL puede tenerlo
 */

/* --- CU-07 · Mapa ------------------------------------------------------- */

/**
 * Payload flaco a proposito: solo lo necesario para pintar el marcador.
 *
 * Trae `incendioActivo`, asi que el mapa se resuelve con UNA llamada. Antes
 * habia que cruzar `/alertas?tipo=INCENDIO&estado=ABIERTA` en cada refresco
 * para saber que contenedor mostrar con halo.
 */
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

/**
 * Ordenadas de mas reciente a mas antigua. Filtros: contenedorId, tipo,
 * severidad, estado.
 *
 * Cada alerta trae `contenedorCodigo`: la tabla no tiene que cruzar fila por
 * fila contra el listado de contenedores para mostrar "CT-0007".
 */
export const fetchAlerts = (filters) => api.get('/alertas', filters);

/** Pasa la alerta a EN_ATENCION. Sin cuerpo. Falla con ALERTA_NO_ABIERTA si ya no esta ABIERTA. */
export const acknowledgeAlert = (id) => api.patch(`/alertas/${id}/atender`);

/** Cierra la alerta y sella resueltaEn. Falla con ALERTA_YA_RESUELTA si ya estaba cerrada. */
export const resolveAlert = (id) => api.patch(`/alertas/${id}/resolver`);

/* --- CU-12 · Prediccion de saturacion ----------------------------------- */

/**
 * Regresion lineal sobre el historico de lecturas. Devuelve `codigo`,
 * `nivelActualPct`, `umbralCriticoPct`, `tasaLlenadoPctPorHora`,
 * `horasHastaUmbral`, `saturacionEstimadaEn`, `confianza` y `muestrasUsadas`.
 *
 * Dos 409 que NO son fallos, sino estados legitimos del contenedor:
 * SIN_LECTURAS_SUFICIENTES (menos de 3 lecturas en el ciclo actual) y
 * TENDENCIA_NO_CRECIENTE (se esta vaciando, no hay saturacion que predecir).
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

/**
 * CU-09. Confirma la propuesta, asigna chofer y pasa la ruta a ASIGNADA.
 *
 * `choferId` es un string libre: el `sub` del JWT de un usuario con rol CHOFER
 * del directorio del Squad 2 (ADR-005). El backend NO lo valida contra ningun
 * padron, asi que no existe CHOFER_NO_ENCONTRADO y un id mal tipeado asigna la
 * ruta igual. Tampoco hay `GET /choferes` para llenar un <select>: por eso la
 * pantalla lo pide escrito a mano. Pedido de contrato pendiente.
 *
 * Errores: 409 RUTA_NO_PROPUESTA, 404 RUTA_NO_ENCONTRADA.
 */
export const assignRoute = (id, data) => api.patch(`/rutas/${id}/asignar`, data);

/* --- CU-10 · Mi ruta y confirmar vaciado -------------------------------- */

/**
 * La ruta activa del chofer AUTENTICADO. La identidad sale del sub del JWT, no
 * de un parametro: si el chofer viajara por query string, cualquiera podria
 * leer la ruta de otro cambiando un valor. La firma no toma argumentos a
 * proposito — si alguien le agrega `?choferId=`, abrio un agujero.
 *
 * Devuelve el objeto expandido de GET /rutas/:id, o CUERPO VACIO con 200
 * cuando no hay ruta activa, que `client.js` convierte en `null`. No tener
 * ruta es el estado normal de alguien que termino el turno, no un error, asi
 * que no es un 404.
 */
export const fetchMyRoute = () => api.get('/rutas/mias');

/**
 * CU-10. El cuerpo es exactamente `{ lat, lng }`: el radio permitido (100 m) es
 * configuracion del servidor, no algo que el cliente pueda mandar.
 *
 * Devuelve la transicion completa. Ojo con `alertasCerradas`: es un NUMERO, no
 * una lista de ids.
 *
 * Errores: 403 PARADA_FUERA_DE_RADIO, 403 PARADA_DE_OTRA_RUTA (un chofer solo
 * confirma paradas de su propia ruta) y 409 PARADA_YA_CONFIRMADA.
 */
export const confirmStop = (id, position) => api.patch(`/paradas/${id}/confirmar`, position);

/**
 * CU-10 · El otro final de una parada: el chofer llego y NO pudo vaciar.
 *
 * El cuerpo es `{ motivo }` y el motivo es OBLIGATORIO (3 a 200 caracteres):
 * sin el, el operador que despues tiene que decidir si manda otro camion no
 * tiene con que decidirlo. Sin motivo el backend devuelve 400.
 *
 * Las tres diferencias con confirmar, todas deliberadas:
 *
 *  - NO vacia el contenedor: sigue lleno y en CRITICO. Pintarlo verde seria
 *    mostrar como recolectado justo el que nadie recolecto.
 *  - NO cierra las alertas, y por eso la respuesta NO trae `alertasCerradas`.
 *    Esa ausencia es el punto: el problema sigue ahi.
 *  - NO exige estar a menos de 100 m, asi que no pide GPS. El caso tipico es
 *    justamente no poder acercarse.
 *
 * Lo que si comparte con confirmar: avanza la ruta. Si era la ultima parada
 * abierta, la ruta pasa a COMPLETADA y el camion vuelve a DISPONIBLE. Ese era
 * el agujero real: sin esto una calle cortada dejaba la ruta trabada en
 * EN_CURSO y el camion tomado para siempre, y CU-03 no deja sacar un camion de
 * EN_RUTA a mano.
 *
 * Errores: 400 por motivo invalido, 403 PARADA_DE_OTRA_RUTA, 409
 * PARADA_YA_CONFIRMADA y 409 PARADA_YA_OMITIDA. Una parada cerrada no se
 * reabre: si el auto se movio, se genera una ruta nueva.
 */
export const skipStop = (id, motivo) => api.patch(`/paradas/${id}/omitir`, { motivo });

/* --- CU-11 · Consulta ciudadana (publico, sin token) -------------------- */

/**
 * Unico endpoint del modulo que no manda Authorization: va por `apiPublic`.
 *
 * Filtros: { lat, lng, radioMetros, tipoResiduo }.
 *
 * Devuelve exactamente seis campos, ordenados por distancia ascendente: id,
 * codigo, lat, lng, tipoResiduo y distanciaMetros. Ni `estado` ni
 * `nivelLlenadoPct`: es informacion operativa interna del municipio y no tiene
 * por que estar en una vista anonima. Los FUERA_DE_SERVICIO no aparecen, y sin
 * resultados devuelve `[]`, no un error.
 */
export const fetchNearbyContainers = (filters) =>
  apiPublic.get('/publico/contenedores/cercanos', filters);
