import { useEffect, useMemo, useState } from 'react';
import ContainersMap from '../components/ContainersMap.jsx';
import ContainerPanel from '../components/ContainerPanel.jsx';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import { useLiveMap, POLLING_INTERVAL_MS } from '../hooks/useLiveMap.js';
import { fetchZones, USING_MOCKS } from '../api/waste.js';
import { readToken } from '../api/client.js';
import { generalMessage } from '../domain/errors.js';
import {
  COLOR_BY_STATE,
  STATE_LABEL,
  WASTE_TYPE_LABEL,
  timeAgo,
} from '../domain/states.js';

/**
 * CU-07 · Mapa en tiempo real.
 *
 * La pantalla principal del modulo y la que se muestra en la demo. Se refresca
 * sola por polling: no hay WebSocket, esta evaluado recien para el Sprint 5.
 */
export default function MapPage({ tokenVersion }) {
  const [zones, setZones] = useState([]);
  const [filters, setFilters] = useState({ zonaId: '', tipoResiduo: '', estado: '' });
  // El incendio no es un estado del contenedor sino otra dimension, y el
  // endpoint del mapa no lo filtra: este se aplica en el cliente.
  const [onlyFires, setOnlyFires] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  // Al backend le van solo la zona y el tipo de residuo. El estado se filtra
  // en el cliente a proposito: si tambien viajara, la respuesta traeria unicamente
  // los del estado elegido y las otras cuatro tarjetas quedarian en cero, que es
  // justo cuando dejan de servir —no podrias comparar ni saber a cual saltar—.
  // De paso, cambiar de tarjeta ya no vuelve a pedirle nada al servidor.
  const { containers, loading, error, updatedAt, refresh } = useLiveMap({
    zonaId: filters.zonaId,
    tipoResiduo: filters.tipoResiduo,
  });

  // El <select> de zonas sale de CU-02. Sin token la llamada solo puede dar
  // 401, asi que no se hace: con mocks no hay token y se pide igual.
  useEffect(() => {
    if (!USING_MOCKS && !readToken()) return;
    fetchZones().then(setZones).catch(() => setZones([]));
  }, [tokenVersion]);

  // Las tarjetas siempre cuentan sobre todo lo que hay en la zona y el tipo
  // elegidos. Apretar una filtra el mapa, no los numeros: el resumen tiene que
  // seguir diciendo cuantos hay de cada estado para que se pueda volver.
  const summary = useMemo(() => {
    const count = { NORMAL: 0, ADVERTENCIA: 0, CRITICO: 0, FUERA_DE_SERVICIO: 0 };
    for (const c of containers) count[c.estado] = (count[c.estado] ?? 0) + 1;
    return count;
  }, [containers]);

  // Los incendios que importan son los de los contenedores que se estan
  // mirando: contar los de otra zona mientras filtras por Centro es mentir.
  //
  // `incendioActivo` viene en el payload del mapa. Antes salia de cruzar una
  // segunda llamada a /alertas en cada refresco; ahora es un campo mas.
  const fireCount = useMemo(
    () => containers.filter((c) => c.incendioActivo).length,
    [containers],
  );

  // Lo unico que el filtro cambia es que se dibuja.
  const visible = useMemo(
    () =>
      containers.filter(
        (c) =>
          (!filters.estado || c.estado === filters.estado) &&
          (!onlyFires || c.incendioActivo),
      ),
    [containers, filters.estado, onlyFires],
  );
  const changeFilter = (field) => (event) =>
    setFilters((previous) => ({ ...previous, [field]: event.target.value }));

  return (
    <div className="screen screen-map">
      {/* Tarjetas de resumen: el conteo por estado se lee de un vistazo, sin
          tener que contar marcadores sobre el mapa. Las cinco son botones que
          filtran el mapa; antes la de incendios se veia igual que las otras
          cuatro y no hacia nada, que era la peor de las dos opciones. */}
      <div className="cards">
        {Object.keys(COLOR_BY_STATE).map((state) => {
          const active = filters.estado === state;
          // Sin aria-label el nombre accesible sale del contenido y se lee
          // "1Normal", que no le sirve a nadie.
          const action = active ? 'Quitar el filtro' : `Ver solo los de estado ${STATE_LABEL[state]}`;
          return (
            <button
              key={state}
              type="button"
              aria-pressed={active}
              aria-label={`${STATE_LABEL[state]}: ${summary[state] ?? 0}. ${action}`}
              title={action}
              className={`card ${active ? 'card-active' : ''}`}
              style={{ '--card-color': COLOR_BY_STATE[state] }}
              onClick={() => setFilters((p) => ({ ...p, estado: active ? '' : state }))}
            >
              <span className="card-number">{summary[state] ?? 0}</span>
              <span className="card-label">{STATE_LABEL[state]}</span>
            </button>
          );
        })}

        {/* El incendio va aparte del estado: no es un cuarto color de llenado,
            es otra dimension. Un contenedor verde puede estar en esta cuenta. */}
        <button
          type="button"
          aria-pressed={onlyFires}
          aria-label={`Incendios abiertos: ${fireCount}. ${
            onlyFires ? 'Quitar el filtro' : 'Ver solo los que tienen incendio'
          }`}
          title={onlyFires ? 'Quitar el filtro' : 'Ver solo los que tienen incendio'}
          className={`card card-fire ${fireCount > 0 ? 'burning' : ''} ${onlyFires ? 'card-active' : ''}`}
          onClick={() => setOnlyFires((v) => !v)}
        >
          <span className="card-number">{fireCount}</span>
          <span className="card-label">Incendios abiertos</span>
        </button>
      </div>

      <div className="filter-bar">
        <select value={filters.zonaId} onChange={changeFilter('zonaId')} aria-label="Filtrar por zona">
          <option value="">Todas las zonas</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.nombre} (umbral {zone.umbralCriticoPct}%)
            </option>
          ))}
        </select>

        <select value={filters.tipoResiduo} onChange={changeFilter('tipoResiduo')} aria-label="Filtrar por tipo de residuo">
          <option value="">Todo tipo de residuo</option>
          {Object.entries(WASTE_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <select value={filters.estado} onChange={changeFilter('estado')} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          {Object.keys(COLOR_BY_STATE).map((state) => (
            <option key={state} value={state}>{STATE_LABEL[state]}</option>
          ))}
        </select>

        <Button variant="secondary" size="sm" onClick={refresh}>Refrescar ahora</Button>

        <span className="muted filter-bar-note">
          Se refresca solo cada {POLLING_INTERVAL_MS / 1000} s
          {updatedAt && ` · actualizado ${timeAgo(updatedAt.toISOString())}`}
        </span>
      </div>

      {error && (
        <Notice type="error" title={`[${error.code}]`}>
          {generalMessage(error) ?? error.message}
        </Notice>
      )}

      <div className="map-and-panel">
        <ContainersMap
          containers={visible}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selectedId && (
          <ContainerPanel
            key={selectedId}
            containerId={selectedId}
            refreshedAt={updatedAt}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {!loading && !error && visible.length === 0 && (
        <Notice type="info" title="No hay contenedores para estos filtros">
          Probá quitando algún filtro. Si nunca sembraste datos contra el backend real:
          <code className="mono"> cd simulator &amp;&amp; TOKEN=&lt;tu-token&gt; npm run seed</code>
        </Notice>
      )}
    </div>
  );
}
