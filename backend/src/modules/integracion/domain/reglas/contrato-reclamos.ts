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

/**
 * Un operador corrigio la categoria. Reclamos lo propuso el 22/10 como
 * ReclamoReclasificado; todavia no esta en el catalogo.
 */
const EVENTOS_RECLAMO_RECLASIFICADO = new Set(['ReclamoReclasificado', 'ReclamoRecategorizado']);

/** Avisos de que el auto ya no esta. Los puede mandar cualquier squad. */
const EVENTOS_RECLAMO_RESUELTO = new Set([
  'ReclamoResuelto',
  'ReclamoCerrado',
  'IntervencionFinalizada',
  'ObstruccionResuelta',
  'ObstruccionLiberada',
]);

const EVENTO_RECLAMO_ACTUALIZADO = 'ReclamoActualizado';
/**
 * Estados en los que el auto ya no tapa nada. Reclamos (Grupo 5) confirmo
 * RESUELTO; los demas cubren un reclamo cerrado sin resolverse (por ejemplo,
 * una denuncia falsa), que tampoco tiene que dejar el contenedor bloqueado.
 */
const ESTADOS_RESUELTO = new Set([
  'RESUELTO',
  'CERRADO',
  'FINALIZADO',
  'RECHAZADO',
  'CANCELADO',
  'DESCARTADO',
]);

/** Lo que entra en `obstruccion_por_reclamo.reclamoId`. Un id mas largo romperia la transaccion. */
const LARGO_MAXIMO_ID = 64;

/** Un correlationId mas largo se descarta: es para trazar, no puede romper nada. */
const LARGO_MAXIMO_CORRELATION_ID = 128;

/** Categorias que por si solas hablan de un vehiculo mal estacionado. */
const CATEGORIAS_DE_ESTACIONAMIENTO = ['estacion', 'vehiculo', 'ciclovia', 'bicisenda'];

/**
 * La categoria real de Reclamos para un auto mal estacionado (contrato del
 * Grupo 5, 22/10). Tambien abarca otros problemas de transito, como un semaforo
 * roto, asi que en ese caso se pide que el objeto afectado sea la ciclovia o que
 * el titulo o la descripcion nombren un vehiculo.
 */
const CATEGORIA_TRANSITO = 'transito';
const OBJETO_CICLOVIA = 'ciclovia';
const MENCIONA_UN_VEHICULO =
  /\b(autos?|coches?|carros?|vehiculos?|estacionad[oa]s?|camionetas?|camion(es)?|utilitarios?|taxis?|remises?|motos?|ciclovias?|bicisendas?)\b/;

export type ReclamoInterpretado =
  | { tipo: 'creado'; reclamoId: string; ubicacion: Punto; correlationId: string | null }
  | { tipo: 'resuelto'; reclamoId: string };

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
  const deReclamos = eventType.startsWith(PREFIJO_RECLAMOS);
  const reclamoId = idDelReclamo(data, deReclamos);

  if (!reclamoId) {
    return null;
  }

  if (EVENTOS_RECLAMO_RESUELTO.has(nombre) || esActualizacionResuelta(nombre, data)) {
    return { tipo: 'resuelto', reclamoId };
  }

  if (!deReclamos) {
    return null;
  }

  if (EVENTOS_RECLAMO_RECLASIFICADO.has(nombre)) {
    return reclasificado(reclamoId, data);
  }

  if (EVENTOS_RECLAMO_CREADO.has(nombre) && esDeEstacionamiento(data)) {
    return creado(reclamoId, data);
  }

  return null;
}

function creado(reclamoId: string, data: Record<string, unknown>): ReclamoInterpretado | null {
  const ubicacion = ubicacionDe(data);

  return ubicacion
    ? { tipo: 'creado', reclamoId, ubicacion, correlationId: correlationDe(data) }
    : null;
}

/**
 * Si con la categoria nueva es un auto mal estacionado, se evalua como un
 * reclamo recien creado. Si deja de serlo, se libera igual que si se hubiera
 * resuelto: si no tapaba nada, liberarlo no hace nada.
 */
function reclasificado(
  reclamoId: string,
  data: Record<string, unknown>,
): ReclamoInterpretado | null {
  const categoria = data.categoriaNueva ?? data.categoria;

  if (typeof categoria !== 'string') {
    return null;
  }

  const conCategoriaNueva = {
    ...data,
    categoria,
    objetoAfectado: data.objetoAfectadoNuevo ?? data.objetoAfectado,
  };

  return esDeEstacionamiento(conCategoriaNueva)
    ? creado(reclamoId, conCategoriaNueva)
    : { tipo: 'resuelto', reclamoId };
}

function correlationDe(data: Record<string, unknown>): string | null {
  const valor = typeof data.correlationId === 'string' ? data.correlationId.trim() : '';

  return valor.length > 0 && valor.length <= LARGO_MAXIMO_CORRELATION_ID ? valor : null;
}

/**
 * `id` a secas solo vale si el evento es de Reclamos: en el de otro modulo es el
 * id de otra cosa (una emergencia, un corte) y podria coincidir con un reclamo.
 */
function idDelReclamo(data: Record<string, unknown>, deReclamos: boolean): string | null {
  const valor = data.reclamoId ?? data.idReclamo ?? (deReclamos ? data.id : undefined);

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

  const categoria = normalizar(data.categoria);

  if (CATEGORIAS_DE_ESTACIONAMIENTO.some((palabra) => categoria.includes(palabra))) {
    return true;
  }

  if (!categoria.includes(CATEGORIA_TRANSITO)) {
    // RESIDUOS incluido: Reclamos abre esos reclamos con nuestras propias alertas
    // de saturacion, en la ubicacion del contenedor. Tomarlos como un auto
    // bloquearia justo el contenedor que hay que vaciar.
    return false;
  }

  // El objeto afectado nombra lo afectado, nunca al auto, y lo elige el vecino:
  // un auto que tapa un contenedor puede venir como MOBILIARIO_URBANO, CALZADA o
  // VEREDA, o sin valor (Reclamos, 30/10). Por eso nunca descarta. Solo CICLOVIA
  // confirma por si solo: con TRANSITO es el auto arriba de la bicisenda.
  if (normalizar(textoDe(data.objetoAfectado)).trim() === OBJETO_CICLOVIA) {
    return true;
  }

  const texto = normalizar(`${textoDe(data.titulo)} ${textoDe(data.descripcion)}`).trim();

  return texto === '' || MENCIONA_UN_VEHICULO.test(texto);
}

/**
 * Sin tildes, en minuscula y con guiones como espacios: "Vehículo mal
 * estacionado" y "VEHICULO_MAL_ESTACIONADO" valen igual.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]/g, ' ')
    .toLowerCase();
}

function textoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
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
