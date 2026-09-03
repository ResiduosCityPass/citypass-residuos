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
