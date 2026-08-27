import { useCallback, useState } from 'react';

/**
 * Ubicacion del navegador, a pedido. La usan CU-11 (el ciudadano busca cerca
 * suyo) y CU-10 (el chofer prueba que esta parado frente al contenedor).
 *
 * Es `getCurrentPosition` y no `watchPosition` a proposito: ADR-004 recorto el
 * soporte offline, y lo que CU-10 necesita es una lectura fresca en el momento
 * exacto de confirmar, no un stream corriendo de fondo gastando bateria.
 *
 * Nunca se dispara sola al montar: el permiso se pide cuando la persona
 * aprieta el boton. Un prompt de GPS antes de que entienda que pantalla esta
 * mirando es exactamente lo que la gente deniega.
 */

export const GEO_STATUS = {
  IDLE: 'idle',
  LOCATING: 'locating',
  READY: 'ready',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
};

/**
 * El codigo 1 de GeolocationPositionError es PERMISSION_DENIED. Se escribe el
 * numero y no la constante porque la clase no existe en jsdom y los tests la
 * necesitan.
 */
const PERMISSION_DENIED = 1;

const MESSAGES = {
  [GEO_STATUS.DENIED]:
    'No nos diste acceso a tu ubicacion. Podes activarlo desde el candado de la barra de direcciones, o cargarla a mano aca abajo.',
  [GEO_STATUS.UNAVAILABLE]: 'Este navegador no puede darnos tu ubicacion.',
  [GEO_STATUS.ERROR]: 'No pudimos leer tu ubicacion. Proba de nuevo o cargala a mano.',
};

export function useGeolocation({ timeoutMs = 10_000 } = {}) {
  const [state, setState] = useState({
    status: GEO_STATUS.IDLE,
    position: null,
    message: null,
  });

  /**
   * Devuelve una promesa con la posicion, o `null` si no se pudo. Nunca
   * rechaza: el que llama ramifica por el valor, y el motivo ya quedo en
   * `status` y `message` para pintarlo en pantalla.
   *
   * Que devuelva la posicion es lo que le permite a CU-10 confirmar con UN
   * tap: pedir la ubicacion y mandarla son el mismo gesto. Si el hook solo
   * dejara el resultado en el estado, el chofer tendria que apretar dos veces.
   */
  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState({
        status: GEO_STATUS.UNAVAILABLE,
        position: null,
        message: MESSAGES[GEO_STATUS.UNAVAILABLE],
      });
      return Promise.resolve(null);
    }

    setState({ status: GEO_STATUS.LOCATING, position: null, message: null });

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const position = {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracyM: coords.accuracy,
          };
          setState({ status: GEO_STATUS.READY, position, message: null });
          resolve(position);
        },
        (error) => {
          const status = error?.code === PERMISSION_DENIED ? GEO_STATUS.DENIED : GEO_STATUS.ERROR;
          setState({ status, position: null, message: MESSAGES[status] });
          resolve(null);
        },
        // maximumAge corto: una posicion de hace cinco minutos no sirve para
        // decidir si el chofer esta a menos de 100 m del contenedor.
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
      );
    });
  }, [timeoutMs]);

  return { ...state, request };
}
