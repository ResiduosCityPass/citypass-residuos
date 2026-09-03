import { MapContainer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import BaseTiles from '../map/BaseTiles.jsx';
import 'leaflet/dist/leaflet.css';
import { colorForState } from '../../domain/states.js';

/** Obelisco: de aca sale y vuelve el camion. */
const DEPOT = [-34.6037, -58.3816];

/**
 * La ruta dibujada sobre el mapa: el recorrido y el orden de las paradas.
 *
 * El orden es lo unico que la heuristica decide, asi que es lo que hay que
 * poder mirar. Cada marcador lleva su numero adentro; sin eso, un operador no
 * tiene forma de juzgar si la propuesta es razonable antes de confirmarla.
 *
 * `me` es opcional y lo usa CU-10: la posicion del chofer, para que vea de un
 * vistazo a que parada esta cerca. El operador de CU-09 no lo pasa.
 */
export default function RouteMap({ stops, me = null }) {
  const points = stops
    .filter((s) => s.contenedor)
    .map((s) => [s.contenedor.lat, s.contenedor.lng]);

  // El recorrido cierra volviendo al deposito, igual que la distancia estimada.
  const path = [DEPOT, ...points, DEPOT];

  return (
    <MapContainer center={DEPOT} zoom={13} className="map map-route" scrollWheelZoom>
      <BaseTiles />

      <Polyline positions={path} pathOptions={{ color: '#2563A6', weight: 3, dashArray: '6 6' }} />

      <CircleMarker
        center={DEPOT}
        radius={8}
        pathOptions={{ color: '#142430', weight: 2, fillColor: '#142430', fillOpacity: 1 }}
      >
        <Tooltip direction="top" offset={[0, -8]}>Depósito</Tooltip>
      </CircleMarker>

      {me && (
        <CircleMarker
          center={[me.lat, me.lng]}
          radius={7}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563A6', fillOpacity: 1 }}
          interactive={false}
        >
          <Tooltip direction="top" offset={[0, -8]} permanent>Estás acá</Tooltip>
        </CircleMarker>
      )}

      {stops.map((stop) =>
        stop.contenedor ? (
          <CircleMarker
            key={stop.id}
            center={[stop.contenedor.lat, stop.contenedor.lng]}
            radius={13}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: colorForState(stop.contenedor.estado),
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} permanent className="stop-order">
              {stop.orden}
            </Tooltip>
          </CircleMarker>
        ) : null,
      )}
    </MapContainer>
  );
}
