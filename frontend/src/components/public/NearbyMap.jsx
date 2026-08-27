import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { colorForWasteType, WASTE_TYPE_LABEL } from '../../domain/states.js';
import { formatDistance } from '../../domain/geo.js';

/**
 * CU-11 · El mapa de la vista ciudadana.
 *
 * Colorea por TIPO DE RESIDUO y no por estado, que es la diferencia de fondo
 * con el mapa del operador: el payload publico no trae el estado, y el nivel
 * de llenado no es asunto del vecino.
 *
 * El circulo del radio no es decoracion: dibuja hasta donde se busco, que es
 * media explicacion de por que la lista tiene los contenedores que tiene.
 */
export default function NearbyMap({ origin, radiusM, containers, selectedId, onSelect }) {
  const center = [origin.lat, origin.lng];

  return (
    <MapContainer center={center} zoom={15} className="map map-public" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Circle
        center={center}
        radius={radiusM}
        pathOptions={{ color: '#2563A6', weight: 1, fillOpacity: 0.06, dashArray: '4 6' }}
        interactive={false}
      />

      {/* Donde esta parada la persona. Rombo oscuro para que no se confunda
          con un contenedor: es el unico punto del mapa que no es un lugar
          adonde ir. */}
      <CircleMarker
        center={center}
        radius={7}
        pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#142430', fillOpacity: 1 }}
        interactive={false}
      >
        <Tooltip direction="top" offset={[0, -8]} permanent>
          Estas aca
        </Tooltip>
      </CircleMarker>

      {containers.map((container) => {
        const selected = container.id === selectedId;
        return (
          <CircleMarker
            key={container.id}
            center={[container.lat, container.lng]}
            radius={selected ? 12 : 9}
            pathOptions={{
              color: selected ? '#142430' : '#ffffff',
              weight: selected ? 3 : 2,
              fillColor: colorForWasteType(container.tipoResiduo),
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelect(container.id) }}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              <strong>{container.codigo}</strong>
              <br />
              {WASTE_TYPE_LABEL[container.tipoResiduo]}
              <br />
              a {formatDistance(container.distanciaMetros)}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
