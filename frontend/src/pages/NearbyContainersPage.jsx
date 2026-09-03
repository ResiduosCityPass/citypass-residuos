import { useEffect, useMemo, useState } from 'react';
import NearbyMap from '../components/public/NearbyMap.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Field from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import { fetchNearbyContainers, USING_MOCKS } from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';
import { WASTE_TYPE_LABEL, WASTE_TYPE_COLOR } from '../domain/states.js';
import { distanceMeters, formatDistance } from '../domain/geo.js';
import { useGeolocation, GEO_STATUS } from '../hooks/useGeolocation.js';

/**
 * CU-11 · Consulta ciudadana de contenedores cercanos.
 *
 * "Tengo pilas usadas, ¿donde las tiro?". Es la unica pantalla publica del
 * modulo: sin sidebar, sin token y sin sesion. Por eso vive fuera del Shell.
 *
 * Lo que NO muestra es tan parte del caso de uso como lo que muestra: ni nivel
 * de llenado ni alertas. Eso es informacion operativa interna, y el endpoint
 * publico tampoco la devuelve.
 */

const RADIUS_OPTIONS = [300, 500, 1000, 2000];

/**
 * Los tres barrios donde el seed pone contenedores. Estan como atajo porque
 * sin ellos, alguien que no da permiso de GPS tiene que tipear coordenadas
 * para ver cualquier cosa.
 */
const PRESETS = [
  { label: 'Obelisco', lat: -34.6037, lng: -58.3816 },
  { label: 'Palermo', lat: -34.5889, lng: -58.4106 },
  { label: 'Chacarita', lat: -34.5875, lng: -58.4515 },
];

export default function NearbyContainersPage() {
  const geo = useGeolocation();

  // De donde sale el origen lo decide un click, no un efecto. Asi la posicion
  // del GPS se deriva durante el render en vez de copiarse a otro estado que
  // despues hay que mantener sincronizado.
  const [source, setSource] = useState(null); // 'gps' | 'manual'
  const [manualOrigin, setManualOrigin] = useState(null);
  const [manualRequested, setManualRequested] = useState(false);
  const [manual, setManual] = useState({ lat: '', lng: '' });

  const [radiusM, setRadiusM] = useState(1000);
  const [wasteType, setWasteType] = useState('');

  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const gps = geo.status === GEO_STATUS.READY ? geo.position : null;
  const usingGps = source === 'gps';

  // Se llevan las coordenadas sueltas y no el objeto porque son las que van a
  // las dependencias del efecto: un objeto nuevo con los mismos numeros no es
  // una busqueda nueva.
  const originLat = (usingGps ? gps?.lat : manualOrigin?.lat) ?? null;
  const originLng = (usingGps ? gps?.lng : manualOrigin?.lng) ?? null;
  const hasOrigin = originLat !== null && originLng !== null;

  const origin = useMemo(
    () => (hasOrigin ? { lat: originLat, lng: originLng } : null),
    [hasOrigin, originLat, originLng],
  );

  const originLabel = usingGps ? 'tu ubicacion' : (manualOrigin?.label ?? '');

  // Si el GPS fallo, el formulario manual se abre solo: no tiene sentido
  // esconder la unica salida que le queda a la persona.
  const geoFailed = [GEO_STATUS.DENIED, GEO_STATUS.UNAVAILABLE, GEO_STATUS.ERROR].includes(
    geo.status,
  );
  const manualOpen = manualRequested || geoFailed;

  useEffect(() => {
    if (!hasOrigin) return;

    let cancelled = false;
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true);
    setError(null);

    fetchNearbyContainers({
      lat: originLat,
      lng: originLng,
      radioMetros: radiusM,
      tipoResiduo: wasteType,
    })
      .then((data) => {
        if (cancelled) return;
        setResults(data ?? []);
        setSelectedId(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasOrigin, originLat, originLng, radiusM, wasteType]);

  /**
   * El orden se calcula de nuevo en el cliente aunque el server ya ordene: son
   * catorce items y el contrato no promete orden. El `??` sobre distanciaMetros
   * es para que la pantalla sobreviva si el backend decide no mandar el campo.
   */
  const sorted = useMemo(() => {
    if (!origin) return [];
    return results
      .map((c) => ({ ...c, meters: c.distanciaMetros ?? distanceMeters(origin, c) }))
      .sort((a, b) => a.meters - b.meters);
  }, [results, origin]);

  const submitManual = (event) => {
    event.preventDefault();
    const lat = Number(manual.lat.replace(',', '.'));
    const lng = Number(manual.lng.replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setManualOrigin({ lat, lng, label: 'la ubicacion que cargaste' });
    setSource('manual');
  };

  const applyPreset = (preset) => {
    setManualOrigin({ lat: preset.lat, lng: preset.lng, label: preset.label });
    setManual({ lat: String(preset.lat), lng: String(preset.lng) });
    setSource('manual');
  };

  const locateMe = () => {
    setSource('gps');
    setManualRequested(false);
    geo.request();
  };

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-brand">
          <img src="/citypass-logo.png" alt="" className="sidebar-logo" />
          <span>CityPass<strong>+</strong></span>
          <span className="muted">· Residuos</span>
        </div>
        {USING_MOCKS && <Chip variant="warning">Datos de demostracion</Chip>}
      </header>

      <main className="public-main">
        <h1>¿Donde tiro esto?</h1>
        <p className="public-lead">
          Buscá los contenedores mas cercanos y filtrá por el tipo de residuo que tenés que tirar.
        </p>

        {!origin && (
          <div className="locate-empty">
            <Button onClick={locateMe} disabled={geo.status === GEO_STATUS.LOCATING}>
              {geo.status === GEO_STATUS.LOCATING ? 'Buscándote…' : 'Usar mi ubicacion'}
            </Button>
            <p className="muted">
              Tu ubicacion se usa solo para esta busqueda. No queda guardada ni se comparte.
            </p>
          </div>
        )}

        {geo.message && (
          <Notice type="warning" title="No pudimos ubicarte">
            {geo.message}
          </Notice>
        )}

        {manualOpen && (
          <form className="manual-origin panel-card" onSubmit={submitManual}>
            <p className="muted">
              Elegí un punto conocido o cargá las coordenadas a mano.
              {/* Sin buscador de direcciones: geocodificar necesita un servicio
                  externo, y eso significa mandarle a un tercero donde esta
                  parada la persona. */}
            </p>

            <div className="preset-row">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="two-col">
              <Field label="Latitud" htmlFor="manual-lat">
                <input
                  id="manual-lat"
                  inputMode="decimal"
                  value={manual.lat}
                  onChange={(e) => setManual((m) => ({ ...m, lat: e.target.value }))}
                  placeholder="-34.6037"
                />
              </Field>
              <Field label="Longitud" htmlFor="manual-lng">
                <input
                  id="manual-lng"
                  inputMode="decimal"
                  value={manual.lng}
                  onChange={(e) => setManual((m) => ({ ...m, lng: e.target.value }))}
                  placeholder="-58.3816"
                />
              </Field>
            </div>

            <Button type="submit" size="sm">Buscar acá</Button>
          </form>
        )}

        {origin && (
          <>
            <div className="filter-bar">
              <label htmlFor="radio">Radio</label>
              <select id="radio" value={radiusM} onChange={(e) => setRadiusM(Number(e.target.value))}>
                {RADIUS_OPTIONS.map((meters) => (
                  <option key={meters} value={meters}>{formatDistance(meters)}</option>
                ))}
              </select>

              <label htmlFor="tipo">Tipo de residuo</label>
              <select id="tipo" value={wasteType} onChange={(e) => setWasteType(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(WASTE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              <span className="muted filter-bar-note">
                Buscando desde {originLabel}
              </span>

              {!manualOpen && (
                <Button variant="ghost" size="sm" onClick={() => setManualRequested(true)}>
                  Usar otra ubicacion
                </Button>
              )}
            </div>

            {error && (
              <Notice type="error" title={`[${error.code}]`}>
                {generalMessage(error) ?? error.message}
              </Notice>
            )}

            <div className="nearby-layout">
              <NearbyMap
                origin={origin}
                radiusM={radiusM}
                containers={sorted}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />

              <div className="nearby-side">
                <ul className="map-legend">
                  {Object.entries(WASTE_TYPE_LABEL).map(([value, label]) => (
                    <li key={value}>
                      <span
                        className="legend-dot"
                        style={{ background: WASTE_TYPE_COLOR[value] }}
                        aria-hidden="true"
                      />
                      {label}
                    </li>
                  ))}
                </ul>

                {loading && <p className="muted">Buscando…</p>}

                {!loading && sorted.length === 0 && !error && (
                  <Notice type="info" title="No hay contenedores en ese radio">
                    Probá ampliando el radio o sacando el filtro de tipo de residuo.
                  </Notice>
                )}

                <ol className="nearby-list">
                  {sorted.map((container) => (
                    <li
                      key={container.id}
                      className={`nearby-item ${container.id === selectedId ? 'selected' : ''}`}
                    >
                      <button type="button" onClick={() => setSelectedId(container.id)}>
                        <span className="nearby-distance">{formatDistance(container.meters)}</span>
                        <span className="mono">{container.codigo}</span>
                        <Chip color={WASTE_TYPE_COLOR[container.tipoResiduo]}>
                          {WASTE_TYPE_LABEL[container.tipoResiduo]}
                        </Chip>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="public-footer muted">
        CityPass+ · Gestion de Residuos Inteligente · Squad 4
      </footer>
    </div>
  );
}
