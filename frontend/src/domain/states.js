/**
 * Vocabulario del dominio, tal cual lo devuelve la API.
 * Fuente: docs/arquitectura/guia-frontend.md, seccion 2.
 * Si agregas un valor aca, revisa que exista en backend/src/shared/domain/enums.ts.
 *
 * Los VALORES quedan en castellano porque son los del contrato del backend;
 * los nombres de las constantes y funciones, en ingles.
 */

export const STATE = {
  NORMAL: 'NORMAL',
  ADVERTENCIA: 'ADVERTENCIA',
  CRITICO: 'CRITICO',
  FUERA_DE_SERVICIO: 'FUERA_DE_SERVICIO',
};

/** El color del marcador sale SOLO del nivel de llenado. El incendio se pinta aparte. */
export const COLOR_BY_STATE = {
  NORMAL: '#4F8A72',            /* Verde Urbano */
  ADVERTENCIA: '#D99838',       /* Ambar */
  CRITICO: '#C83E4D',           /* Rojo Emergencia */
  FUERA_DE_SERVICIO: '#68717D', /* Gris Medio */
};

export const STATE_LABEL = {
  NORMAL: 'Normal',
  ADVERTENCIA: 'Advertencia',
  CRITICO: 'Critico',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

export const WASTE_TYPE_LABEL = {
  COMUN: 'Comun',
  RECICLABLE: 'Reciclable',
  ORGANICO: 'Organico',
};

/**
 * CU-11 · La vista ciudadana colorea por TIPO, no por estado: el payload
 * publico no trae el estado y el nivel de llenado no es asunto del vecino.
 *
 * Hexadecimales y no variables CSS porque Leaflet los usa en `pathOptions`,
 * que no resuelve custom properties. Son los mismos de tokens.css.
 */
export const WASTE_TYPE_COLOR = {
  COMUN: '#68717D',      /* Gris Medio */
  RECICLABLE: '#2563A6', /* Azul Institucional */
  ORGANICO: '#4F8A72',   /* Verde Urbano */
};

export const colorForWasteType = (type) => WASTE_TYPE_COLOR[type] ?? WASTE_TYPE_COLOR.COMUN;

export const colorForState = (state) => COLOR_BY_STATE[state] ?? COLOR_BY_STATE.FUERA_DE_SERVICIO;

/**
 * Un contenedor sin sensor se queda en NORMAL con nivel 0 y ultimaLecturaEn null
 * para siempre. No es un contenedor vacio: es uno que no reporta, y conviene
 * distinguirlo en la UI para no mostrar un verde que miente.
 */
export const neverReported = (container) => container.ultimaLecturaEn === null;

/** "hace 3 min" a partir de un ISO, o un guion si nunca reporto. */
export function timeAgo(iso) {
  if (!iso) return '—';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'hace instantes';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

/* ------------------------------------------------------------------------
 * Alertas (CU-05 / CU-06)
 * ---------------------------------------------------------------------- */

export const ALERT_TYPE_LABEL = {
  SATURACION: 'Saturacion',
  INCENDIO: 'Incendio',
  BATERIA_BAJA: 'Bateria baja',
  SENSOR_CAIDO: 'Sensor caido',
};

export const ALERT_STATE_LABEL = {
  ABIERTA: 'Abierta',
  EN_ATENCION: 'En atencion',
  RESUELTA: 'Resuelta',
};

export const SEVERITY_LABEL = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Critica',
};

/**
 * Sufijos de clase CSS por estado y severidad.
 *
 * Existen para no armar la clase concatenando el enum del backend
 * (`alerta-${estado.toLowerCase()}`), que producia nombres a medio traducir
 * como `.alert-abierta`. El mapeo explicito mantiene el CSS en un solo idioma.
 */
export const ALERT_STATE_CLASS = {
  ABIERTA: 'open',
  EN_ATENCION: 'in-progress',
  RESUELTA: 'resolved',
};

export const SEVERITY_CLASS = {
  BAJA: 'low',
  MEDIA: 'medium',
  ALTA: 'high',
  CRITICA: 'critical',
};

/**
 * La maquina de estados es ABIERTA -> EN_ATENCION -> RESUELTA. No se puede
 * saltear ni volver atras.
 *
 * Estas dos funciones existen para deshabilitar los botones en vez de dejar que
 * el usuario se coma un 409 ALERTA_NO_ABIERTA o ALERTA_YA_RESUELTA. El backend
 * valida igual: esto es cortesia de la UI, no seguridad.
 */
export const canAcknowledge = (alert) => alert.estado === 'ABIERTA';
export const canResolve = (alert) => alert.estado === 'ABIERTA' || alert.estado === 'EN_ATENCION';

/**
 * El incendio NO depende del llenado: se evalua la temperatura contra el umbral
 * de la zona. Un contenedor al 5% (verde) puede estar prendido fuego. Es
 * exactamente el caso que no se puede pasar por alto, y por eso se marca aparte
 * del color de estado.
 */
export const isActiveFire = (alert) => alert.tipo === 'INCENDIO' && alert.estado !== 'RESUELTA';

/* ------------------------------------------------------------------------
 * Flota (CU-03)
 * ---------------------------------------------------------------------- */

export const TRUCK_STATE_LABEL = {
  DISPONIBLE: 'Disponible',
  EN_RUTA: 'En ruta',
  MANTENIMIENTO: 'Mantenimiento',
};

export const TRUCK_STATE_CHIP = {
  DISPONIBLE: 'success',
  EN_RUTA: 'info',
  MANTENIMIENTO: 'warning',
};

/** Solo un camion DISPONIBLE puede recibir una ruta nueva. */
export const isTruckAvailable = (truck) => truck.estado === 'DISPONIBLE';

/**
 * Los unicos estados que un humano puede elegir en el formulario.
 *
 * EN_RUTA queda afuera y el backend devuelve 400 si se lo manda: lo fija la
 * asignacion de ruta (CU-09) y lo libera la ultima confirmacion de parada
 * (CU-10). Poder ponerlo a mano abria una trampa sin salida —un camion EN_RUTA
 * sin ruta asociada no se puede destrabar, porque justamente esta en ruta y no
 * hay ninguna ruta que cerrar—. Se muestra en la tabla, no se ofrece en el
 * <select>.
 */
export const TRUCK_STATE_SELECTABLE = ['DISPONIBLE', 'MANTENIMIENTO'];

/* ------------------------------------------------------------------------
 * Rutas y paradas (CU-08 / CU-09 / CU-10)
 * ---------------------------------------------------------------------- */

export const ROUTE_STATE_LABEL = {
  PROPUESTA: 'Propuesta',
  ASIGNADA: 'Asignada',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

export const ROUTE_STATE_CHIP = {
  PROPUESTA: 'warning',
  ASIGNADA: 'info',
  EN_CURSO: 'info',
  COMPLETADA: 'success',
  CANCELADA: 'neutral',
};

export const STOP_STATE_LABEL = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  OMITIDA: 'Omitida',
};

/**
 * Una ruta recien generada nace en PROPUESTA y NO queda asignada. La separacion
 * entre generar y asignar es deliberada: mantiene a una persona en el medio,
 * que es exactamente lo que pide CU-09 por si la heuristica propone algo
 * absurdo. Solo desde PROPUESTA se puede asignar.
 */
export const canAssign = (route) => route.estado === 'PROPUESTA';

/** Las rutas que un chofer todavia tiene que recorrer (CU-10). */
export const isRouteLive = (route) => route?.estado === 'ASIGNADA' || route?.estado === 'EN_CURSO';

/**
 * CU-10 · Una parada PENDIENTE tiene DOS finales posibles, y los dos la cierran:
 * confirmar el vaciado u omitirla porque no se pudo vaciar.
 *
 * Igual que canAcknowledge y canResolve: esto es cortesia de la UI para no
 * comerse un 409, no seguridad. El backend valida igual.
 *
 * Una parada cerrada no se reabre, ni confirmada ni omitida: los dos casos dan
 * 409. Si el auto que tapaba el contenedor se movio, se genera una ruta nueva.
 * Por eso las dos preguntas son la misma.
 */
export const canConfirmStop = (stop) => stop?.estado === 'PENDIENTE';
export const canSkipStop = (stop) => stop?.estado === 'PENDIENTE';

/**
 * "2 de 3 vaciados" en la cabecera del chofer.
 *
 * `confirmed` y `closed` NO son lo mismo, y la diferencia importa: una parada
 * omitida cierra la parada y avanza la ruta, pero no vacia nada. Si se
 * contaran juntas, una ruta donde el chofer no pudo vaciar ni un contenedor
 * mostraria "3 de 3 vaciados", que es exactamente lo contrario de lo que paso.
 *
 * Por eso el texto cuenta `confirmed` —lo que realmente se vacio— y la barra
 * usa `closed` —lo que ya no tiene nada pendiente—, que es lo que hace que la
 * barra llegue al final justo cuando la ruta se completa.
 */
export function stopsProgress(paradas = []) {
  const confirmed = paradas.filter((s) => s.estado === 'CONFIRMADA').length;
  const skipped = paradas.filter((s) => s.estado === 'OMITIDA').length;
  return { confirmed, skipped, closed: confirmed + skipped, total: paradas.length };
}

/* ------------------------------------------------------------------------
 * Prediccion de saturacion (CU-12)
 * ---------------------------------------------------------------------- */

/**
 * Un contenedor sin lecturas no tiene de donde predecir: la regresion se hace
 * sobre el historico de LECTURA. Preguntarle igual al backend seria pedir un
 * 404 a proposito.
 */
export const canPredict = (container) => container.ultimaLecturaEn !== null;

/**
 * La confianza sale de la regresion (R²). Por debajo de 0.5 la prediccion
 * existe pero no sirve para planificar, y la UI tiene que decirlo en vez de
 * mostrar "se satura en 2,5 h" con la misma cara que una prediccion firme.
 */
export const CONFIDENCE_FLOOR = 0.5;

export function confidenceLevel(confidence) {
  if (confidence >= 0.8) return 'alta';
  if (confidence >= CONFIDENCE_FLOOR) return 'media';
  return 'baja';
}

/** "en 2,5 h" · "en 3 d" · "ya superado". Para el titular de la tarjeta. */
export function formatHoursUntil(hours) {
  if (hours === null || hours === undefined) return null;
  if (hours <= 0) return 'ya superado';
  if (hours < 1) return `en ${Math.round(hours * 60)} min`;
  if (hours < 48) return `en ${hours.toFixed(1).replace('.', ',')} h`;
  return `en ${Math.round(hours / 24)} d`;
}
