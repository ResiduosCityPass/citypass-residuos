export interface Punto {
  lat: number;
  lng: number;
}

const RADIO_TIERRA_METROS = 6_371_000;

/**
 * Distancia en metros entre dos puntos, por Haversine.
 *
 * Convive con la version SQL que usa CU-11, y es a proposito: aquella tiene que
 * correr dentro de la consulta para poder filtrar por radio y ordenar en la
 * base. Esta corre en memoria, sobre candidatos ya cargados, para el
 * planificador de rutas. Son dos lugares distintos, no una duplicacion por
 * descuido.
 */
export function distanciaMetros(a: Punto, b: Punto): number {
  const radianes = (grados: number) => (grados * Math.PI) / 180;

  const dLat = radianes(b.lat - a.lat);
  const dLng = radianes(b.lng - a.lng);
  const senoLat = Math.sin(dLat / 2);
  const senoLng = Math.sin(dLng / 2);

  const h =
    senoLat * senoLat + Math.cos(radianes(a.lat)) * Math.cos(radianes(b.lat)) * senoLng * senoLng;

  return 2 * RADIO_TIERRA_METROS * Math.asin(Math.sqrt(Math.min(1, h)));
}

export const distanciaKm = (a: Punto, b: Punto): number => distanciaMetros(a, b) / 1000;

/**
 * Los candidatos a `radioMetros` o menos del centro, con su distancia, en el
 * orden en que vinieron.
 *
 * ponytail: los eventos del bus recorren todos los contenedores activos en
 * memoria. Alcanza para cientos; con miles, pasar a la consulta por radio de
 * `ContenedorCercanoRepository` (CU-11).
 */
export function dentroDelRadio<T extends Punto>(
  centro: Punto,
  candidatos: T[],
  radioMetros: number,
): { item: T; distancia: number }[] {
  return candidatos
    .map((item) => ({ item, distancia: distanciaMetros(centro, item) }))
    .filter(({ distancia }) => distancia <= radioMetros);
}

/**
 * La ubicacion de un evento del bus. Cada squad la manda a su manera: acepta
 * `latitud`/`longitud` o `lat`/`lng`, sueltos o dentro de `ubicacion`, y
 * numeros en texto. null si no hay un par valido.
 */
export function ubicacionDe(data: Record<string, unknown>): Punto | null {
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
