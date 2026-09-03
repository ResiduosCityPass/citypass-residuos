import { ApiError } from '../api/client.js';
import { ZONES, CONTAINERS, SENSORS, ALERTS, TRUCKS, ROUTES, STOPS } from './data.js';
import { DEPOT, distanceKm, distanceMeters } from '../domain/geo.js';

/**
 * Servidor falso en memoria. Implementa las mismas firmas que api/waste.http.js
 * y devuelve las mismas formas documentadas en docs/arquitectura/guia-frontend.md.
 *
 * Dos reglas que lo hacen util en vez de decorativo:
 *
 *  1. **Muta el store.** Dar de alta un contenedor lo agrega a la tabla; resolver
 *     una alerta la mueve de estado. Un mock que siempre devuelve lo mismo deja
 *     sin probar justo lo que hay que disenar: que pasa despues de la accion.
 *
 *  2. **Falla como falla el backend**, con ApiError y los mismos `code` estables
 *     (ZONA_CON_CONTENEDORES, CONTENEDOR_YA_TIENE_SENSOR, ALERTA_NO_ABIERTA...).
 *     Si el mock siempre dijera que si, las pantallas de error se disenarian
 *     contra un backend imaginario.
 *
 * ANDAMIAJE TEMPORAL: se borra cuando las pantallas se conecten al backend.
 */

/* Copias mutables: los fixtures quedan intactos por si hace falta reiniciar. */
const store = {
  zones: ZONES.map((z) => ({ ...z })),
  containers: CONTAINERS.map((c) => ({ ...c })),
  sensors: SENSORS.map((s) => ({ ...s })),
  alerts: ALERTS.map((a) => ({ ...a })),
  trucks: TRUCKS.map((t) => ({ ...t })),
  routes: ROUTES.map((r) => ({ ...r })),
  stops: STOPS.map((s) => ({ ...s })),
};

/** Latencia falsa: sin ella los esqueletos de carga nunca se ven y no se pueden disenar. */
const LATENCY_MS = 320;
const respond = (value) =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), LATENCY_MS));

const fail = (code, status, message) =>
  new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          new ApiError({
            code,
            status,
            message: Array.isArray(message) ? message.join('. ') : message,
            details: Array.isArray(message) ? message : null,
          }),
        ),
      LATENCY_MS,
    ),
  );

const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** Replica el generador de codigos del backend: CT-0001, CT-0002, SN-0001... */
function nextCode(prefix, existing) {
  const numbers = existing
    .map((c) => Number(new RegExp(`^${prefix}-(\\d+)$`).exec(c.codigo)?.[1]))
    .filter(Number.isFinite);
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

const zoneOf = (id) => store.zones.find((z) => z.id === id);
const sensorOf = (containerId) => store.sensors.find((s) => s.contenedorId === containerId) ?? null;
const active = () => store.containers.filter((c) => c.activo);

const matches = (container, { zonaId, tipoResiduo, estado }) =>
  (!zonaId || container.zonaId === zonaId) &&
  (!tipoResiduo || container.tipoResiduo === tipoResiduo) &&
  (!estado || container.estado === estado);

/* --- CU-07 · Mapa ------------------------------------------------------- */

/**
 * `zonaNombre`, `umbralCriticoPct` e `incendioActivo` los agrego el backend
 * para que el mapa se resuelva con UNA sola llamada: antes habia que cruzar
 * `/alertas?tipo=INCENDIO&estado=ABIERTA` en cada refresco y pedir la zona
 * aparte para saber donde va la marca del umbral.
 *
 * `incendioActivo` es independiente del `estado`: el estado refleja el llenado
 * y el incendio se evalua contra la temperatura, asi que un contenedor NORMAL
 * al 8% puede tenerlo en true.
 */
export const fetchMapContainers = (filters = {}) =>
  respond(
    active()
      .filter((c) => matches(c, filters))
      .map(({ id, codigo, lat, lng, estado, tipoResiduo, nivelLlenadoPct, ultimaLecturaEn, zonaId }) => ({
        id, codigo, lat, lng, estado, tipoResiduo, nivelLlenadoPct, ultimaLecturaEn,
        zonaNombre: zoneOf(zonaId)?.nombre ?? null,
        umbralCriticoPct: zoneOf(zonaId)?.umbralCriticoPct ?? null,
        incendioActivo: store.alerts.some(
          (a) => a.contenedorId === id && a.tipo === 'INCENDIO' && a.estado !== 'RESUELTA',
        ),
      })),
  );

/* --- CU-01 · Contenedores ----------------------------------------------- */

export const fetchContainers = (filters = {}) =>
  respond(active().filter((c) => matches(c, filters)));

export function fetchContainer(id) {
  const container = store.containers.find((c) => c.id === id);
  if (!container) return fail('CONTENEDOR_NO_ENCONTRADO', 404, `No existe el contenedor ${id}`);
  return respond({ ...container, zona: zoneOf(container.zonaId), sensor: sensorOf(id) });
}

export function createContainer(data) {
  const errors = [];
  if (!data.zonaId) errors.push('zonaId must be a UUID');
  if (!['COMUN', 'RECICLABLE', 'ORGANICO'].includes(data.tipoResiduo)) {
    errors.push('tipoResiduo must be one of the following values: COMUN, RECICLABLE, ORGANICO');
  }
  if (!(data.capacidadLitros >= 1 && data.capacidadLitros <= 100000)) {
    errors.push('capacidadLitros must not be less than 1');
  }
  if (!Number.isFinite(Number(data.lat))) errors.push('lat must be a latitude string or number');
  if (!Number.isFinite(Number(data.lng))) errors.push('lng must be a longitude string or number');
  if (errors.length) return fail('HTTP_400', 400, errors);

  if (!zoneOf(data.zonaId)) {
    return fail('ZONA_NO_ENCONTRADA', 404, `No existe la zona ${data.zonaId}`);
  }
  if (data.codigo && store.containers.some((c) => c.codigo === data.codigo)) {
    return fail('CONTENEDOR_CODIGO_DUPLICADO', 409, `Ya existe un contenedor con el codigo "${data.codigo}"`);
  }

  // Arranca en NORMAL con nivel 0 y sin lecturas, igual que el backend.
  const created = {
    id: newId('ct'),
    codigo: data.codigo || nextCode('CT', store.containers),
    zonaId: data.zonaId,
    tipoResiduo: data.tipoResiduo,
    capacidadLitros: Number(data.capacidadLitros),
    lat: Number(data.lat),
    lng: Number(data.lng),
    estado: 'NORMAL',
    nivelLlenadoPct: 0,
    temperaturaC: null,
    ultimaLecturaEn: null,
    activo: true,
    creadoEn: now(),
    actualizadoEn: now(),
  };
  store.containers.push(created);
  return respond(created);
}

export function updateContainer(id, changes) {
  const container = store.containers.find((c) => c.id === id);
  if (!container) return fail('CONTENEDOR_NO_ENCONTRADO', 404, `No existe el contenedor ${id}`);
  if (changes.zonaId && !zoneOf(changes.zonaId)) {
    return fail('ZONA_NO_ENCONTRADA', 404, `No existe la zona ${changes.zonaId}`);
  }

  // `codigo` se descarta a proposito: el backend no lo acepta en el PATCH.
  const { codigo: _ignored, ...allowed } = changes;
  Object.assign(container, allowed, { actualizadoEn: now() });
  if (allowed.capacidadLitros != null) container.capacidadLitros = Number(allowed.capacidadLitros);
  if (allowed.lat != null) container.lat = Number(allowed.lat);
  if (allowed.lng != null) container.lng = Number(allowed.lng);
  return respond(container);
}

/** Baja logica: la fila sobrevive, deja de aparecer en listados y en el mapa. */
export function deleteContainer(id) {
  const container = store.containers.find((c) => c.id === id);
  if (!container) return fail('CONTENEDOR_NO_ENCONTRADO', 404, `No existe el contenedor ${id}`);
  container.activo = false;
  container.actualizadoEn = now();
  return respond(null);
}

export function linkSensor(containerId, data = {}) {
  const container = store.containers.find((c) => c.id === containerId);
  if (!container) return fail('CONTENEDOR_NO_ENCONTRADO', 404, `No existe el contenedor ${containerId}`);
  if (sensorOf(containerId)) {
    return fail('CONTENEDOR_YA_TIENE_SENSOR', 409, `El contenedor ${container.codigo} ya tiene un sensor vinculado`);
  }
  if (data.codigo && store.sensors.some((s) => s.codigo === data.codigo)) {
    return fail('SENSOR_CODIGO_DUPLICADO', 409, `Ya existe un sensor con el codigo "${data.codigo}"`);
  }

  const created = {
    id: newId('sn'),
    codigo: data.codigo || nextCode('SN', store.sensors),
    contenedorId: containerId,
    estado: 'ACTIVO',
    bateriaPct: 100,
    ultimoReporteEn: null,
    creadoEn: now(),
    actualizadoEn: now(),
  };
  store.sensors.push(created);

  // La apiKey se devuelve una sola vez y no se guarda: el store, igual que el
  // backend, se queda solo con el sensor. Volver a pedirla es imposible aca
  // tambien, que es justo lo que la pantalla tiene que dejar claro.
  return respond({
    sensorId: created.id,
    codigo: created.codigo,
    contenedorId: containerId,
    apiKey: Array.from({ length: 48 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
    advertencia: 'Guardala ahora: no se puede volver a consultar.',
  });
}

/* --- CU-02 · Zonas ------------------------------------------------------ */

export const fetchZones = () => respond(store.zones);

export function createZone(data) {
  const errors = [];
  if (!data.nombre || data.nombre.length < 2) errors.push('nombre must be longer than or equal to 2 characters');
  if (!(data.umbralCriticoPct >= 1 && data.umbralCriticoPct <= 100)) {
    errors.push('umbralCriticoPct must not be greater than 100');
  }
  if (!(data.umbralTemperaturaC >= 20 && data.umbralTemperaturaC <= 150)) {
    errors.push('umbralTemperaturaC must not be less than 20');
  }
  if (errors.length) return fail('HTTP_400', 400, errors);

  if (store.zones.some((z) => z.nombre.toLowerCase() === data.nombre.toLowerCase())) {
    return fail('ZONA_NOMBRE_DUPLICADO', 409, `Ya existe una zona con el nombre "${data.nombre}"`);
  }

  const created = {
    id: newId('zn'),
    nombre: data.nombre,
    umbralCriticoPct: Number(data.umbralCriticoPct),
    umbralTemperaturaC: Number(data.umbralTemperaturaC),
    bloqueada: false,
    creadaEn: now(),
    actualizadaEn: now(),
  };
  store.zones.push(created);
  return respond(created);
}

export function updateZone(id, changes) {
  const zone = zoneOf(id);
  if (!zone) return fail('ZONA_NO_ENCONTRADA', 404, `No existe la zona ${id}`);
  if (changes.nombre && store.zones.some((z) => z.id !== id && z.nombre.toLowerCase() === changes.nombre.toLowerCase())) {
    return fail('ZONA_NOMBRE_DUPLICADO', 409, `Ya existe una zona con el nombre "${changes.nombre}"`);
  }

  Object.assign(zone, changes, { actualizadaEn: now() });
  if (changes.umbralCriticoPct != null) zone.umbralCriticoPct = Number(changes.umbralCriticoPct);
  if (changes.umbralTemperaturaC != null) zone.umbralTemperaturaC = Number(changes.umbralTemperaturaC);
  return respond(zone);
}

export function setZoneBlocked(id, blocked) {
  const zone = zoneOf(id);
  if (!zone) return fail('ZONA_NO_ENCONTRADA', 404, `No existe la zona ${id}`);
  zone.bloqueada = Boolean(blocked);
  zone.actualizadaEn = now();
  return respond(zone);
}

export function deleteZone(id) {
  const zone = zoneOf(id);
  if (!zone) return fail('ZONA_NO_ENCONTRADA', 404, `No existe la zona ${id}`);

  // El mensaje dice cuantos contenedores quedan, y eso es lo accionable:
  // "no se puede borrar" a secas obliga a ir a buscar el motivo a otra pantalla.
  const howMany = active().filter((c) => c.zonaId === id).length;
  if (howMany > 0) {
    return fail('ZONA_CON_CONTENEDORES', 409, `La zona "${zone.nombre}" todavia tiene ${howMany} contenedores asignados`);
  }

  store.zones = store.zones.filter((z) => z.id !== id);
  return respond(null);
}

/* --- CU-05 / CU-06 · Alertas -------------------------------------------- */

export function fetchAlerts(filters = {}) {
  const { contenedorId: containerId, tipo, severidad, estado } = filters;
  const result = store.alerts
    .filter(
      (a) =>
        (!containerId || a.contenedorId === containerId) &&
        (!tipo || a.tipo === tipo) &&
        (!severidad || a.severidad === severidad) &&
        (!estado || a.estado === estado),
    )
    .sort((a, b) => new Date(b.detectadaEn) - new Date(a.detectadaEn))
    // `contenedorCodigo` viene en la respuesta: la tabla ya no tiene que cruzar
    // cada fila contra el listado de contenedores para mostrar "CT-0007".
    .map((a) => ({
      ...a,
      contenedorCodigo: store.containers.find((c) => c.id === a.contenedorId)?.codigo ?? null,
    }));
  return respond(result);
}

export function acknowledgeAlert(id) {
  const alert = store.alerts.find((a) => a.id === id);
  if (!alert) return fail('ALERTA_NO_ENCONTRADA', 404, `No existe la alerta ${id}`);
  // La maquina de estados no se puede saltear ni volver atras.
  if (alert.estado !== 'ABIERTA') {
    return fail('ALERTA_NO_ABIERTA', 409, `La alerta ya esta en estado ${alert.estado}`);
  }
  alert.estado = 'EN_ATENCION';
  return respond(alert);
}

export function resolveAlert(id) {
  const alert = store.alerts.find((a) => a.id === id);
  if (!alert) return fail('ALERTA_NO_ENCONTRADA', 404, `No existe la alerta ${id}`);
  if (alert.estado === 'RESUELTA') {
    return fail('ALERTA_YA_RESUELTA', 409, 'La alerta ya fue resuelta');
  }
  alert.estado = 'RESUELTA';
  alert.resueltaEn = now();
  return respond(alert);
}

/* ========================================================================
 * CU-12 · Prediccion de saturacion
 * ====================================================================== */

/**
 * El backend hace regresion lineal sobre el historico de LECTURA. Aca no hay
 * historico, asi que se sintetiza una tasa estable por contenedor a partir de
 * su id: lo importante para disenar la pantalla es que el numero sea coherente
 * entre recargas y que aparezcan los tres casos que cambian la UI —prediccion
 * firme, prediccion de baja confianza, y umbral ya superado—.
 */
export function fetchPrediction(id) {
  const container = store.containers.find((c) => c.id === id);
  if (!container) return fail('CONTENEDOR_NO_ENCONTRADO', 404, `No existe el contenedor ${id}`);

  // Sin lecturas no hay de donde predecir.
  if (container.ultimaLecturaEn === null) {
    return fail('SIN_LECTURAS_SUFICIENTES', 409, `El contenedor ${container.codigo} todavia no reporto ninguna lectura`);
  }

  // Un contenedor que reporto y esta en cero es uno que acaban de vaciar: la
  // serie va para abajo y darle una fecha de saturacion seria inventar un
  // futuro. Es el caso que dispara TENDENCIA_NO_CRECIENTE, y se puede provocar
  // a voluntad confirmando una parada en la pantalla del chofer.
  if (container.nivelLlenadoPct === 0) {
    return fail('TENDENCIA_NO_CRECIENTE', 409, `El contenedor ${container.codigo} no se esta llenando: no hay saturacion que predecir`);
  }

  const zone = zoneOf(container.zonaId);
  const level = container.nivelLlenadoPct;
  const threshold = zone.umbralCriticoPct;

  // Valores estables derivados del id. El hash pondera la posicion de cada
  // caracter a proposito: los ids de los fixtures difieren en un solo digito, y
  // una suma simple los dejaba a todos en la misma banda de confianza. Con esta
  // dispersion aparecen los tres casos que cambian la pantalla —confianza alta,
  // media y por debajo del piso util—, que es para lo que existen los fixtures.
  const seed = [...container.id].reduce((acc, ch, i) => (acc * 31 + ch.charCodeAt(0) * (i + 1)) % 9973, 7);
  const ratePerHour = Number((1.2 + (seed % 35) / 10).toFixed(2));
  const samples = 18 + (seed % 120);
  const confidence = Number((0.3 + (seed % 65) / 100).toFixed(2));

  const hoursUntil = level >= threshold ? 0 : Number(((threshold - level) / ratePerHour).toFixed(1));

  return respond({
    contenedorId: container.id,
    codigo: container.codigo,
    nivelActualPct: level,
    // El umbral viaja en la respuesta para no tener que pedir la zona aparte.
    umbralCriticoPct: threshold,
    tasaLlenadoPctPorHora: ratePerHour,
    horasHastaUmbral: hoursUntil,
    saturacionEstimadaEn: new Date(Date.now() + hoursUntil * 3600_000).toISOString(),
    confianza: confidence,
    muestrasUsadas: samples,
  });
}

/* ========================================================================
 * CU-03 · Flota
 * ====================================================================== */

export const fetchTrucks = (filters = {}) =>
  respond(store.trucks.filter((t) => !filters.estado || t.estado === filters.estado));

export function createTruck(data) {
  const errors = [];
  if (!data.patente || data.patente.trim().length < 6) errors.push('patente must be longer than or equal to 6 characters');
  if (!(data.capacidadLitros >= 1000 && data.capacidadLitros <= 40000)) {
    errors.push('capacidadLitros must not be less than 1000');
  }
  if (!['COMUN', 'RECICLABLE', 'ORGANICO'].includes(data.tipoResiduoHabilitado)) {
    errors.push('tipoResiduoHabilitado must be one of the following values: COMUN, RECICLABLE, ORGANICO');
  }
  if (errors.length) return fail('HTTP_400', 400, errors);

  const plate = data.patente.trim().toUpperCase();
  if (store.trucks.some((t) => t.patente === plate)) {
    return fail('CAMION_PATENTE_DUPLICADA', 409, `Ya existe un camion con la patente "${plate}"`);
  }

  const created = {
    id: newId('cm'),
    patente: plate,
    capacidadLitros: Number(data.capacidadLitros),
    tipoResiduoHabilitado: data.tipoResiduoHabilitado,
    estado: 'DISPONIBLE',
    creadoEn: now(),
    actualizadoEn: now(),
  };
  store.trucks.push(created);
  return respond(created);
}

export function updateTruck(id, changes) {
  const truck = store.trucks.find((t) => t.id === id);
  if (!truck) return fail('CAMION_NO_ENCONTRADO', 404, `No existe el camion ${id}`);

  // EN_RUTA no es un estado que se pueda pedir: lo fija la asignacion de ruta
  // (CU-09) y lo libera la ultima parada confirmada (CU-10). Aceptarlo a mano
  // dejaba camiones trabados sin ninguna ruta que cerrar para liberarlos.
  if (changes.estado === 'EN_RUTA') {
    return fail('HTTP_400', 400, ['estado must be one of the following values: DISPONIBLE, MANTENIMIENTO']);
  }

  // Un camion EN_RUTA no se puede mandar a mantenimiento por el medio: primero
  // hay que cerrar o cancelar su ruta.
  if (truck.estado === 'EN_RUTA' && changes.estado && changes.estado !== 'EN_RUTA') {
    return fail('CAMION_EN_RUTA', 409, `El camion ${truck.patente} esta en ruta: cerra su ruta antes de cambiarle el estado`);
  }

  Object.assign(truck, changes, { actualizadoEn: now() });
  if (changes.capacidadLitros != null) truck.capacidadLitros = Number(changes.capacidadLitros);
  if (changes.patente) truck.patente = changes.patente.trim().toUpperCase();
  return respond(truck);
}

/* ========================================================================
 * CU-08 / CU-09 · Rutas
 * ====================================================================== */

/** Litros que ocupa hoy un contenedor, segun su nivel de llenado. */
const litersIn = (container) => (container.capacidadLitros * container.nivelLlenadoPct) / 100;

const routeStops = (routeId) =>
  store.stops.filter((s) => s.rutaId === routeId).sort((a, b) => a.orden - b.orden);

/**
 * Una ruta con camion y paradas (con su contenedor) anidados.
 *
 * NO hay objeto `chofer`, solo `choferId`: los choferes son usuarios del
 * directorio del Squad 2 y este modulo no guarda una copia de sus datos.
 */
function expandRoute(route) {
  return {
    ...route,
    camion: store.trucks.find((t) => t.id === route.camionId) ?? null,
    paradas: routeStops(route.id).map((stop) => ({
      ...stop,
      contenedor: store.containers.find((c) => c.id === stop.contenedorId) ?? null,
    })),
  };
}

export const fetchRoutes = (filters = {}) =>
  respond(
    store.routes
      .filter((r) => !filters.estado || r.estado === filters.estado)
      .sort((a, b) => new Date(b.generadaEn) - new Date(a.generadaEn))
      .map(expandRoute),
  );

export function fetchRoute(id) {
  const route = store.routes.find((r) => r.id === id);
  if (!route) return fail('RUTA_NO_ENCONTRADA', 404, `No existe la ruta ${id}`);
  return respond(expandRoute(route));
}

/**
 * CU-08 · Heuristica nearest-neighbor con restriccion de capacidad.
 *
 * Es la version recortada que decidio ADR-004: el problema completo es un VRP
 * con capacidad, NP-hard. Esta version es explicable y determinista, que es lo
 * que hace falta para demostrar el caso de uso.
 *
 * Arranca en el Obelisco y en cada paso toma el contenedor critico mas cercano
 * que todavia entre en el camion. Salta —no corta— los que no entran: un
 * contenedor de 3200 L no deberia bloquear a los tres de 1100 que le siguen.
 */
export function generateRoute(data = {}) {
  const truck = store.trucks.find((t) => t.id === data.camionId);
  if (!truck) return fail('CAMION_NO_ENCONTRADO', 404, `No existe el camion ${data.camionId}`);
  if (truck.estado !== 'DISPONIBLE') {
    return fail('CAMION_NO_DISPONIBLE', 409, `El camion ${truck.patente} esta en estado ${truck.estado}`);
  }

  // Los que ya estan en una ruta viva no se vuelven a rutear.
  const liveRouteIds = store.routes
    .filter((r) => ['PROPUESTA', 'ASIGNADA', 'EN_CURSO'].includes(r.estado))
    .map((r) => r.id);
  const alreadyRouted = new Set(
    store.stops.filter((s) => liveRouteIds.includes(s.rutaId)).map((s) => s.contenedorId),
  );

  let candidates = active().filter(
    (c) =>
      c.estado === 'CRITICO' &&
      c.tipoResiduo === truck.tipoResiduoHabilitado &&
      !alreadyRouted.has(c.id) &&
      // Una zona bloqueada queda excluida del ruteo. Es el punto de CU-02.
      !zoneOf(c.zonaId)?.bloqueada &&
      (!data.zonaId || c.zonaId === data.zonaId),
  );

  if (candidates.length === 0) {
    return fail(
      'RUTA_SIN_CONTENEDORES',
      409,
      `No hay contenedores criticos de tipo ${truck.tipoResiduoHabilitado} sin rutear para este camion`,
    );
  }

  const picked = [];
  let position = DEPOT;
  let load = 0;
  let distance = 0;

  while (candidates.length > 0) {
    const reachable = candidates.filter((c) => load + litersIn(c) <= truck.capacidadLitros);
    if (reachable.length === 0) break;

    const nearest = reachable.reduce((best, c) =>
      distanceKm(position, c) < distanceKm(position, best) ? c : best,
    );

    distance += distanceKm(position, nearest);
    load += litersIn(nearest);
    position = nearest;
    picked.push(nearest);
    candidates = candidates.filter((c) => c.id !== nearest.id);
  }

  distance += distanceKm(position, DEPOT); // la vuelta al deposito

  const route = {
    id: newId('rt'),
    camionId: truck.id,
    choferId: null,
    estado: 'PROPUESTA',
    distanciaEstimadaKm: Number(distance.toFixed(1)),
    litrosEstimados: Math.round(load),
    generadaEn: now(),
    asignadaEn: null,
  };
  store.routes.push(route);

  picked.forEach((container, index) => {
    store.stops.push({
      id: newId('pd'),
      rutaId: route.id,
      contenedorId: container.id,
      orden: index + 1,
      estado: 'PENDIENTE',
      confirmadaEn: null,
    });
  });

  // El camion NO pasa a EN_RUTA todavia: la ruta es una propuesta hasta que
  // una persona la confirme. Esa es toda la razon de ser de CU-09.
  return respond(expandRoute(route));
}

/**
 * CU-09 · Confirmar la propuesta y asignarle chofer.
 *
 * Recien aca la ruta se vuelve real y el camion queda tomado.
 */
export function assignRoute(id, data = {}) {
  const route = store.routes.find((r) => r.id === id);
  if (!route) return fail('RUTA_NO_ENCONTRADA', 404, `No existe la ruta ${id}`);
  if (route.estado !== 'PROPUESTA') {
    return fail('RUTA_NO_PROPUESTA', 409, `La ruta ya esta en estado ${route.estado}`);
  }
  if (!data.choferId) return fail('HTTP_400', 400, ['choferId should not be empty']);

  // `choferId` es un string libre: el `sub` del JWT del chofer. El backend NO
  // lo valida contra ningun padron —no tiene contra cual—, asi que aca tampoco.
  // Por eso CHOFER_NO_ENCONTRADO no existe del lado del servidor.
  route.choferId = data.choferId;
  route.estado = 'ASIGNADA';
  route.asignadaEn = now();

  const truck = store.trucks.find((t) => t.id === route.camionId);
  if (truck) {
    truck.estado = 'EN_RUTA';
    truck.actualizadoEn = now();
  }

  return respond(expandRoute(route));
}

/* ========================================================================
 * CU-10 · Confirmar vaciado
 * ====================================================================== */

/** Radio permitido, configuracion del servidor. El default del contrato son 100 m. */
export const CONFIRM_RADIUS_M = 100;

/**
 * La ruta activa del chofer. Sin argumentos: en el backend la identidad sale
 * del `sub` del JWT y no hay forma de pedir la ruta de otro.
 *
 * Devuelve `null` con exito cuando no hay ruta activa: un chofer que ya
 * termino el turno no es un error, asi que no es un 404.
 */
export function fetchMyRoute() {
  const route = store.routes.find((r) => ['ASIGNADA', 'EN_CURSO'].includes(r.estado));
  return respond(route ? expandRoute(route) : null);
}

/**
 * Confirma el vaciado de una parada validando la cercania del chofer.
 *
 * Ademas de marcar la parada, reproduce los efectos que el contrato le pide al
 * backend: devuelve el contenedor a NORMAL, cierra sus alertas de saturacion
 * abiertas, y mueve la ruta. Eso hace que confirmar en /chofer se vea al toque
 * en /alertas, /mapa y /flota, que es como se demuestra el ciclo completo.
 */
export function confirmStop(id, position = {}) {
  const stop = store.stops.find((s) => s.id === id);
  if (!stop) return fail('PARADA_NO_ENCONTRADA', 404, `No existe la parada ${id}`);

  if (stop.estado === 'CONFIRMADA') {
    return fail('PARADA_YA_CONFIRMADA', 409, `La parada ${stop.orden} ya fue confirmada`);
  }

  const lat = Number(position.lat);
  const lng = Number(position.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail('HTTP_400', 400, [
      'lat must be a latitude string or number',
      'lng must be a longitude string or number',
    ]);
  }

  const container = store.containers.find((c) => c.id === stop.contenedorId);
  const meters = Math.round(distanceMeters({ lat, lng }, container));

  // PROPUESTA: api-preliminar.md documenta el 403 pero no le puso `code`.
  if (meters > CONFIRM_RADIUS_M) {
    return fail(
      'PARADA_FUERA_DE_RADIO',
      403,
      `Estas a ${meters} m del contenedor ${container.codigo}. El maximo permitido es ${CONFIRM_RADIUS_M} m`,
    );
  }

  stop.estado = 'CONFIRMADA';
  stop.confirmadaEn = now();

  container.nivelLlenadoPct = 0;
  // Un contenedor fuera de servicio no vuelve a NORMAL por vaciarlo: lo que
  // tiene roto es el sensor o la tapa, no el nivel.
  if (container.estado !== 'FUERA_DE_SERVICIO') container.estado = 'NORMAL';
  container.actualizadoEn = now();

  const closed = store.alerts.filter(
    (a) => a.contenedorId === container.id && a.tipo === 'SATURACION' && a.estado !== 'RESUELTA',
  );
  closed.forEach((a) => {
    a.estado = 'RESUELTA';
    a.resueltaEn = now();
  });

  // PROPUESTA: el contrato no dice nada del ciclo de vida de la ruta. La
  // primera confirmacion la arranca, la ultima la cierra y libera el camion.
  const route = store.routes.find((r) => r.id === stop.rutaId);
  if (route.estado === 'ASIGNADA') route.estado = 'EN_CURSO';
  if (routeStops(route.id).every((s) => s.estado !== 'PENDIENTE')) {
    route.estado = 'COMPLETADA';
    const truck = store.trucks.find((t) => t.id === route.camionId);
    if (truck) {
      truck.estado = 'DISPONIBLE';
      truck.actualizadoEn = now();
    }
  }

  // PROPUESTA de payload del 200: la transicion completa, para que el llamador
  // sepa que paso sin tener que volver a pedir todo.
  return respond({
    paradaId: stop.id,
    estado: stop.estado,
    confirmadaEn: stop.confirmadaEn,
    contenedorId: container.id,
    estadoContenedor: container.estado,
    nivelLlenadoPct: container.nivelLlenadoPct,
    // Un NUMERO, no una lista de ids: el id de una alerta ya cerrada no le
    // sirve a la pantalla, y devolverlo obligaba a cargar entidades enteras
    // solo para descartarlas.
    alertasCerradas: closed.length,
    rutaEstado: route.estado,
    distanciaMetros: meters,
  });
}

/* ========================================================================
 * CU-11 · Consulta ciudadana (publico)
 * ====================================================================== */

const DEFAULT_RADIUS_M = 1000;

export function fetchNearbyContainers(filters = {}) {
  const lat = Number(filters.lat);
  const lng = Number(filters.lng);

  const errors = [];
  if (!Number.isFinite(lat)) errors.push('lat must be a latitude string or number');
  if (!Number.isFinite(lng)) errors.push('lng must be a longitude string or number');
  if (errors.length > 0) return fail('HTTP_400', 400, errors);

  const from = { lat, lng };
  const radius = Number(filters.radioMetros ?? DEFAULT_RADIUS_M);

  return respond(
    active()
      // Mandar a alguien caminando hasta un contenedor roto es peor que no
      // listarlo. Filtrar POR el estado no es lo mismo que exponerlo.
      .filter((c) => c.estado !== 'FUERA_DE_SERVICIO')
      .filter((c) => !filters.tipoResiduo || c.tipoResiduo === filters.tipoResiduo)
      .map((c) => ({ c, meters: Math.round(distanceMeters(from, c)) }))
      .filter(({ meters }) => meters <= radius)
      .sort((a, b) => a.meters - b.meters)
      // Proyeccion por lista explicita de campos, NUNCA por rest: agregar
      // manana un campo al fixture no puede filtrar nivelLlenadoPct ni estado
      // a la vista publica por accidente. Ese es todo el punto de CU-11.
      .map(({ c, meters }) => ({
        id: c.id,
        codigo: c.codigo,
        lat: c.lat,
        lng: c.lng,
        tipoResiduo: c.tipoResiduo,
        distanciaMetros: meters,
      })),
  );
}
