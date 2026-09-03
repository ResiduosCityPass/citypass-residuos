import { Fragment } from 'react';
import { MapContainer, CircleMarker, Tooltip } from 'react-leaflet';
import BaseTiles from './map/BaseTiles.jsx';
import 'leaflet/dist/leaflet.css';
import { colorForState, STATE_LABEL, neverReported } from '../domain/states.js';

/** Obelisco: el seed del simulador crea los contenedores alrededor de este punto. */
const CABA_CENTER = [-34.6037, -58.3816];

export default function ContainersMap({ containers, selectedId, onSelect }) {
  return (
    <MapContainer center={CABA_CENTER} zoom={15} className="map" scrollWheelZoom>
      <BaseTiles />

      {containers.map((container) => {
        // `incendioActivo` lo trae el propio payload del mapa: no depende del
        // estado ni de una segunda llamada a /alertas.
        const hasFire = Boolean(container.incendioActivo);
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
                {container.zonaNombre && <span className="tooltip-zone"> · {container.zonaNombre}</span>}
                <br />
                {STATE_LABEL[container.estado]} · {container.nivelLlenadoPct}%
                {/* "94% sobre un umbral de 70" se entiende mucho mejor que un 94%
                    solo. El umbral viene en el payload del mapa, asi que no hay
                    que pedir la zona aparte para mostrarlo. */}
                {container.umbralCriticoPct != null && (
                  <span className="tooltip-muted"> (umbral {container.umbralCriticoPct}%)</span>
                )}
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
