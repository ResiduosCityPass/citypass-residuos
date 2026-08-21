import { Fragment } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { colorForState, STATE_LABEL, neverReported } from '../domain/states.js';

/** Obelisco: el seed del simulador crea los contenedores alrededor de este punto. */
const CABA_CENTER = [-34.6037, -58.3816];

export default function ContainersMap({ containers, fires, selectedId, onSelect }) {
  return (
    <MapContainer center={CABA_CENTER} zoom={15} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {containers.map((container) => {
        const hasFire = Boolean(fires[container.id]);
        const selected = container.id === selectedId;

        return (
          <Fragment key={container.id}>
            {/* Halo de incendio: va APARTE del color de estado, porque un contenedor
                puede estar verde y estar prendido fuego al mismo tiempo. */}
            {hasFire && (
              <CircleMarker
                center={[container.lat, container.lng]}
                radius={18}
                pathOptions={{ color: '#ff5722', weight: 3, fillOpacity: 0.15, fillColor: '#ff5722' }}
                interactive={false}
                className="fire-halo"
              />
            )}

            <CircleMarker
              center={[container.lat, container.lng]}
              radius={selected ? 12 : 9}
              pathOptions={{
                color: selected ? '#142430' : '#ffffff',
                weight: selected ? 3 : 2,
                fillColor: colorForState(container.estado),
                fillOpacity: neverReported(container) ? 0.45 : 1,
              }}
              eventHandlers={{ click: () => onSelect(container.id) }}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <strong>{container.codigo}</strong>
                <br />
                {STATE_LABEL[container.estado]} · {container.nivelLlenadoPct}%
                {hasFire && (
                  <>
                    <br />
                    <span className="tooltip-fire">INCENDIO abierto</span>
                  </>
                )}
                {neverReported(container) && (
                  <>
                    <br />
                    <span className="tooltip-muted">sin lecturas</span>
                  </>
                )}
              </Tooltip>
            </CircleMarker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
