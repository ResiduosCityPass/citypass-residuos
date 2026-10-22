import { Punto } from '../../../../shared/domain/geo';

/**
 * CU-INT-02 · Como se lee un evento de reclamos que llega por el bus.
 *
 * ponytail: el contrato con Reclamos todavia no existe, y tampoco se sabe que
 * squad avisa que el auto ya no esta. Hasta que se cierre, se aceptan las
 * variantes razonables de nombre de evento y de campos. Cuando se defina, se
 * recortan estas listas a los nombres reales y nada mas cambia.
 *
 * Funciones puras sobre el sobre del evento: nada de framework ni de base.
 */

const PREFIJO_RECLAMOS = 'com.citypass.reclamos.';

const EVENTOS_RECLAMO_CREADO = new Set(['ReclamoCreado', 'ReclamoRegistrado', 'ReclamoPublicado']);

/** Avisos de que el auto ya no esta. Los puede mandar cualquier squad. */
const EVENTOS_RECLAMO_RESUELTO = new Set([
  'ReclamoResuelto',
  'ReclamoCerrado',
  'IntervencionFinalizada',
  'ObstruccionResuelta',
  'ObstruccionLiberada',
]);

const EVENTO_RECLAMO_ACTUALIZADO = 'ReclamoActualizado';
const ESTADOS_RESUELTO = new Set(['RESUELTO', 'CERRADO', 'FINALIZADO']);

/** Lo que entra en `obstruccion_por_reclamo.reclamoId`. Un id mas largo romperia la transaccion. */
const LARGO_MAXIMO_ID = 64;

/** Si el reclamo trae categoria, tiene que ser de un vehiculo que bloquea. */
const CATEGORIAS_DE_ESTACIONAMIENTO = ['estacion', 'vehiculo', 'ciclovia', 'bicisenda'];

export type ReclamoInterpretado =
  { tipo: 'creado'; reclamoId: string; ubicacion: Punto } | { tipo: 'resuelto'; reclamoId: string };

/**
 * Devuelve null si el evento no es de reclamos, si no es de estacionamiento o
 * si le falta algo para poder usarlo. Nunca tira: un evento inutilizable se
 * ignora, porque rechazarlo hace que el bus lo reintente para siempre.
 */
export function interpretarReclamo(
  eventType: string,
  data: Record<string, unknown>,
): ReclamoInterpretado | null {
  const nombre = eventType.slice(eventType.lastIndexOf('.') + 1);
  const reclamoId = idDelReclamo(data);

  if (!reclamoId) {
    return null;
  }

  if (EVENTOS_RECLAMO_RESUELTO.has(nombre) || esActualizacionResuelta(nombre, data)) {
    return { tipo: 'resuelto', reclamoId };
  }

  if (
    eventType.startsWith(PREFIJO_RECLAMOS) &&
    EVENTOS_RECLAMO_CREADO.has(nombre) &&
    esDeEstacionamiento(data)
  ) {
    const ubicacion = ubicacionDe(data);
    return ubicacion ? { tipo: 'creado', reclamoId, ubicacion } : null;
  }

  return null;
}

function idDelReclamo(data: Record<string, unknown>): string | null {
  const valor = data.reclamoId ?? data.idReclamo ?? data.id;

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return String(valor);
  }

  const id = typeof valor === 'string' ? valor.trim() : '';

  return id.length > 0 && id.length <= LARGO_MAXIMO_ID ? id : null;
}

function esActualizacionResuelta(nombre: string, data: Record<string, unknown>): boolean {
  const estado = data.estadoNuevo ?? data.estado;

  return (
    nombre === EVENTO_RECLAMO_ACTUALIZADO &&
    typeof estado === 'string' &&
    ESTADOS_RESUELTO.has(estado.toUpperCase())
  );
}

function esDeEstacionamiento(data: Record<string, unknown>): boolean {
  if (typeof data.categoria !== 'string') {
    return true;
  }

  // Sin tildes y en minuscula: "Vehículo mal estacionado" y "VEHICULO_MAL_ESTACIONADO" valen igual.
  const categoria = data.categoria.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  return CATEGORIAS_DE_ESTACIONAMIENTO.some((palabra) => categoria.includes(palabra));
}

function ubicacionDe(data: Record<string, unknown>): Punto | null {
  const anidada =
    typeof data.ubicacion === 'object' && data.ubicacion !== null
      ? (data.ubicacion as Record<string, unknown>)
      : null;

  return parDeCoordenadas(data) ?? (anidada ? parDeCoordenadas(anidada) : null);
}

function parDeCoordenadas(origen: Record<string, unknown>): Punto | null {
  const lat = numero(origen.latitud ?? origen.lat);
  const lng = numero(origen.longitud ?? origen.lng);

  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  return { lat, lng };
}

/** Acepta numeros y numeros en texto: "-34.6037" es una coordenada valida. */
function numero(valor: unknown): number | null {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;

  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
