import * as http from './waste.http.js';
import * as mock from '../mocks/server.js';

/**
 * Unica superficie de datos de la aplicacion.
 *
 * Ninguna pantalla importa de `waste.http.js` ni de `mocks/` directamente:
 * todas importan de aca. Eso es lo que hace que conectar el modulo al backend
 * sea apagar una variable de entorno y no reescribir cuatro pantallas.
 *
 * Con VITE_USE_MOCKS=true corre contra el servidor falso en memoria, sin
 * backend, sin Docker y sin token. Con false, contra la API real.
 *
 * Es andamiaje con fecha de vencimiento: cuando las cuatro pantallas esten
 * conectadas, se borra `mocks/`, se borra la variable y este archivo vuelve a
 * ser un re-export de `waste.http.js`.
 */
export const USING_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

const source = USING_MOCKS ? mock : http;

/* CU-07 · Mapa */
export const fetchMapContainers = (...args) => source.fetchMapContainers(...args);

/* CU-01 · Contenedores */
export const fetchContainers = (...args) => source.fetchContainers(...args);
export const fetchContainer = (...args) => source.fetchContainer(...args);
export const createContainer = (...args) => source.createContainer(...args);
export const updateContainer = (...args) => source.updateContainer(...args);
export const deleteContainer = (...args) => source.deleteContainer(...args);
export const linkSensor = (...args) => source.linkSensor(...args);

/* CU-02 · Zonas */
export const fetchZones = (...args) => source.fetchZones(...args);
export const createZone = (...args) => source.createZone(...args);
export const updateZone = (...args) => source.updateZone(...args);
export const setZoneBlocked = (...args) => source.setZoneBlocked(...args);
export const deleteZone = (...args) => source.deleteZone(...args);

/* CU-12 · Prediccion */
export const fetchPrediction = (...args) => source.fetchPrediction(...args);

/* CU-03 · Flota */
export const fetchTrucks = (...args) => source.fetchTrucks(...args);
export const createTruck = (...args) => source.createTruck(...args);
export const updateTruck = (...args) => source.updateTruck(...args);

/* CU-08 / CU-09 · Rutas */
export const fetchRoutes = (...args) => source.fetchRoutes(...args);
export const fetchRoute = (...args) => source.fetchRoute(...args);
export const generateRoute = (...args) => source.generateRoute(...args);
export const assignRoute = (...args) => source.assignRoute(...args);

/* CU-05 / CU-06 · Alertas */
export const fetchAlerts = (...args) => source.fetchAlerts(...args);
export const acknowledgeAlert = (...args) => source.acknowledgeAlert(...args);
export const resolveAlert = (...args) => source.resolveAlert(...args);

/* CU-10 · Confirmar vaciado */
export const fetchMyRoute = (...args) => source.fetchMyRoute(...args);
export const confirmStop = (...args) => source.confirmStop(...args);

/* CU-11 · Consulta ciudadana */
export const fetchNearbyContainers = (...args) => source.fetchNearbyContainers(...args);
