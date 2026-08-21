import { Fragment } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { colorDeEstado, ETIQUETA_ESTADO, nuncaReporto } from '../dominio/estados.js';

/** Obelisco: el seed del simulador crea los contenedores alrededor de este punto. */
const CENTRO_CABA = [-34.6037, -58.3816];

export default function MapaContenedores({ contenedores, incendios, seleccionadoId, onSeleccionar }) {
  return (
    <MapContainer center={CENTRO_CABA} zoom={15} className="mapa" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {contenedores.map((contenedor) => {
        const tieneIncendio = Boolean(incendios[contenedor.id]);
        const seleccionado = contenedor.id === seleccionadoId;

        return (
          <Fragment key={contenedor.id}>
            {/* Halo de incendio: va APARTE del color de estado, porque un contenedor
                puede estar verde y estar prendido fuego al mismo tiempo. */}
            {tieneIncendio && (
              <CircleMarker
                center={[contenedor.lat, contenedor.lng]}
                radius={18}
                pathOptions={{ color: '#ff5722', weight: 3, fillOpacity: 0.15, fillColor: '#ff5722' }}
                interactive={false}
                className="halo-incendio"
              />
            )}

            <CircleMarker
              center={[contenedor.lat, contenedor.lng]}
              radius={seleccionado ? 12 : 9}
              pathOptions={{
                color: seleccionado ? '#1b1f23' : '#ffffff',
                weight: seleccionado ? 3 : 2,
                fillColor: colorDeEstado(contenedor.estado),
                fillOpacity: nuncaReporto(contenedor) ? 0.45 : 1,
              }}
              eventHandlers={{ click: () => onSeleccionar(contenedor.id) }}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <strong>{contenedor.codigo}</strong>
                <br />
                {ETIQUETA_ESTADO[contenedor.estado]} · {contenedor.nivelLlenadoPct}%
                {tieneIncendio && (
                  <>
                    <br />
                    <span className="tooltip-incendio">INCENDIO abierto</span>
                  </>
                )}
                {nuncaReporto(contenedor) && (
                  <>
                    <br />
                    <span className="tooltip-tenue">sin lecturas</span>
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
