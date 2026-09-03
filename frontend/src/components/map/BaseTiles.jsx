import { useEffect, useRef } from 'react';
import { TileLayer, useMap } from 'react-leaflet';

/**
 * Fondo cartografico compartido por los tres mapas del modulo: el de CU-07, el
 * de rutas (CU-08/09/10) y el publico de CU-11.
 *
 * Estaba repetido en los tres, asi que la URL y la atribucion vivian tres veces.
 * Misma politica que los colores: ninguna pantalla escribe la URL a mano.
 *
 * Se sirve desde `tile.openstreetmap.de`, el mirror que opera FOSSGIS, y no
 * desde `tile.openstreetmap.org`, porque este ultimo no es alcanzable desde
 * todas las redes y ahi el mapa queda gris sin ninguna explicacion.
 *
 * Es el mismo render, con los mismos datos y la misma licencia: cambia el
 * servidor, no el mapa. Por eso la atribucion no cambia.
 *
 * Descartado CARTO, que era la alternativa obvia por su fondo neutro: hoy
 * devuelve los tiles con una marca de agua "API KEY REQUIRED" si no se registra
 * una cuenta.
 */
const TILES_URL = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Un tile suelto que falla no significa nada —pasa con cualquier proveedor—.
 * Varios seguidos si: es la red, y conviene decirlo en vez de mostrar un
 * rectangulo gris que se lee como "la aplicacion esta rota".
 */
const ERRORS_BEFORE_WARNING = 4;

/** Marca el contenedor del mapa; el aviso lo dibuja el CSS. */
const OFFLINE_CLASS = 'map--no-basemap';

export default function BaseTiles() {
  const map = useMap();
  const failures = useRef(0);

  // El mapa puede desmontarse con la clase puesta y Leaflet reusa el nodo.
  useEffect(() => () => map.getContainer().classList.remove(OFFLINE_CLASS), [map]);

  return (
    <TileLayer
      url={TILES_URL}
      attribution={ATTRIBUTION}
      eventHandlers={{
        tileerror: () => {
          failures.current += 1;
          if (failures.current >= ERRORS_BEFORE_WARNING) {
            map.getContainer().classList.add(OFFLINE_CLASS);
          }
        },
        // Si vuelve a haber fondo, se saca el aviso y se arranca de cero: puede
        // ser una caida momentanea y no un bloqueo.
        tileload: () => {
          failures.current = 0;
          map.getContainer().classList.remove(OFFLINE_CLASS);
        },
      }}
    />
  );
}
