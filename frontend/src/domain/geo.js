/**
 * Geometria sobre lat/lng. Vive en el dominio y no en los mocks porque la usan
 * tres cosas distintas: la heuristica de ruteo de CU-08, el filtro por radio de
 * CU-11 y la validacion de cercania de CU-10.
 *
 * Todas las funciones toman objetos `{lat, lng}`: un contenedor, una parada
 * expandida y una posicion del GPS entran igual sin adaptador.
 */

/** Radio medio de la Tierra, en kilometros. */
const EARTH_RADIUS_KM = 6371;

/** Obelisco: de aca sale y vuelve el camion (CU-08), y aca centran los mapas. */
export const DEPOT = { lat: -34.6037, lng: -58.3816 };

/** Haversine en kilometros. */
export function distanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Los radios de CU-10 y CU-11 se expresan en metros; la conversion vive aca. */
export const distanceMeters = (a, b) => distanceKm(a, b) * 1000;

/** Si `a` esta a `meters` o menos de `b`. El borde exacto cuenta como adentro. */
export const withinMeters = (a, b, meters) => distanceMeters(a, b) <= meters;

/**
 * "320 m" o "1,4 km".
 *
 * Debajo del kilometro se muestra en metros redondos: a alguien que va
 * caminando "0,3 km" no le dice nada y "320 m" si.
 */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Leaflet quiere `[lat, lng]`; el dominio habla `{lat, lng}`. */
export const toLatLng = ({ lat, lng }) => [lat, lng];
