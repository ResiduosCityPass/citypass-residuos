import { useCallback, useEffect, useState } from 'react';
import RouteMap from '../components/routes/RouteMap.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import FillBar from '../components/ui/FillBar.jsx';
import Notice from '../components/ui/Notice.jsx';
import { fetchMyRoute, confirmStop, fetchDrivers, USING_MOCKS } from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';
import {
  STOP_STATE_LABEL,
  ROUTE_STATE_LABEL,
  ROUTE_STATE_CHIP,
  canConfirmStop,
  stopsProgress,
  timeAgo,
} from '../domain/states.js';
import { distanceMeters, formatDistance } from '../domain/geo.js';
import { useGeolocation, GEO_STATUS } from '../hooks/useGeolocation.js';

/**
 * CU-10 · Confirmar vaciado.
 *
 * La pantalla del chofer, parado en la vereda con el celular en la mano. Por
 * eso vive fuera del Shell: una columna angosta, botones grandes, y nada de
 * sidebar.
 *
 * ADR-004 recorto el soporte offline: la confirmacion es online, con
 * validacion de GPS por radio. La cola local quedo en Tier 3.
 */

/** El radio que valida el backend. Se muestra para que el mensaje sea accionable. */
const RADIUS_M = 100;

/** Un jitter de ~22 m, para que la posicion simulada no sea un sospechoso "0 m". */
const JITTER = 0.0002;

export default function DriverStopsPage() {
  const geo = useGeolocation();

  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState('');

  const [confirmingId, setConfirmingId] = useState(null);
  const [feedback, setFeedback] = useState(null); // { stopId, type, title, body }
  const [simulateGps, setSimulateGps] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchMyRoute(driverId)
      .then((data) => {
        // El contrato no dice si /rutas/mias devuelve objeto o array. Se
        // normaliza aca para que la pantalla no dependa de cual eligieron.
        setRoute(Array.isArray(data) ? (data[0] ?? null) : data);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [driverId]);

  useEffect(() => {
    // La carga inicial es la sincronizacion con el backend, no un derivado.
    // oxlint-disable-next-line react/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!USING_MOCKS) return;
    fetchDrivers().then(setDrivers).catch(() => setDrivers([]));
  }, []);

  const paradas = route?.paradas ?? [];
  const { confirmed, total } = stopsProgress(paradas);

  /**
   * La posicion que se manda. Se pide FRESCA en cada confirmacion en vez de
   * reusar la ultima: el chofer se movio entre una parada y la siguiente.
   *
   * El simulador esta gateado por USING_MOCKS y no puede estar de otra forma:
   * en produccion seria un bypass del unico control que tiene este caso de
   * uso. Existe porque los contenedores del seed estan en CABA y cualquiera
   * que pruebe la demo esta a kilometros, asi que sin esto el camino feliz no
   * se puede mostrar.
   */
  const positionFor = (stop) => {
    if (USING_MOCKS && simulateGps && stop.contenedor) {
      return Promise.resolve({
        lat: stop.contenedor.lat + JITTER,
        lng: stop.contenedor.lng + JITTER,
      });
    }
    return geo.request();
  };

  const confirm = async (stop) => {
    setFeedback(null);
    setConfirmingId(stop.id);

    const position = await positionFor(stop);
    if (!position) {
      // Sin ubicacion no se confirma, y no hay fallback manual de coordenadas
      // aca a diferencia de CU-11: dejarle escribir la posicion al chofer
      // anula el control entero. El motivo ya lo muestra geo.message.
      setConfirmingId(null);
      return;
    }

    try {
      await confirmStop(stop.id, { lat: position.lat, lng: position.lng });
      setFeedback({ stopId: stop.id, type: 'success', title: 'Vaciado confirmado' });
      await load();
    } catch (err) {
      if (err.code === 'PARADA_FUERA_DE_RADIO') {
        // El backend dice que paso; la pantalla dice cuanto falta, que es lo
        // unico accionable estando parado en la calle.
        const away = stop.contenedor ? distanceMeters(position, stop.contenedor) : null;
        setFeedback({
          stopId: stop.id,
          type: 'warning',
          title: 'Estás demasiado lejos',
          body: away
            ? `Estás a ${formatDistance(away)} del contenedor. Acercate a menos de ${RADIUS_M} m.`
            : generalMessage(err),
        });
      } else if (err.code === 'PARADA_YA_CONFIRMADA') {
        // Casi siempre es un doble tap o el otro dispositivo. No es una falla.
        setFeedback({ stopId: stop.id, type: 'info', title: 'Esta parada ya figura confirmada' });
        await load();
      } else {
        setFeedback({
          stopId: stop.id,
          type: 'error',
          title: `[${err.code}]`,
          body: generalMessage(err) ?? err.message,
        });
      }
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="driver-shell">
      <header className="driver-header">
        <div className="driver-header-top">
          <span>Mi ruta</span>
          <span className="driver-cu">CU-10</span>
        </div>

        {route ? (
          <>
            <div className="driver-route-line">
              <strong className="mono">{route.camion?.patente ?? 'sin camión'}</strong>
              <Chip variant={ROUTE_STATE_CHIP[route.estado]}>{ROUTE_STATE_LABEL[route.estado]}</Chip>
            </div>
            <FillBar levelPct={total ? (confirmed / total) * 100 : 0} state="NORMAL" compact />
            <p className="driver-progress">{confirmed} de {total} vaciados</p>
          </>
        ) : (
          !loading && <p className="driver-progress">Sin ruta activa</p>
        )}
      </header>

      <main className="driver-main">
        {USING_MOCKS && (
          <div className="panel-card demo-panel">
            <Notice type="info" title="Modo demostración">
              Sin login federado no hay chofer autenticado: acá se elige a mano. Contra el backend
              real la ruta sale del token y este selector no aparece.
            </Notice>

            <label htmlFor="chofer">Chofer</label>
            <select id="chofer" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">El del token</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>

            <label className="demo-gps">
              <input
                type="checkbox"
                checked={simulateGps}
                onChange={(e) => setSimulateGps(e.target.checked)}
              />
              Simular que estoy en el contenedor
            </label>
          </div>
        )}

        {loading && <p className="muted">Cargando tu ruta…</p>}

        {error && (
          <Notice type="error" title={`[${error.code}]`}>
            {generalMessage(error) ?? error.message}
          </Notice>
        )}

        {!loading && !error && !route && (
          <Notice type="info" title="No tenés ninguna ruta asignada">
            Cuando el operador te asigne una, va a aparecer acá con sus paradas.
          </Notice>
        )}

        {route && (
          <>
            <RouteMap stops={paradas} me={geo.position} />

            {geo.message && (
              <Notice type="warning" title="No pudimos ubicarte">
                {geo.message}
              </Notice>
            )}

            <ol className="stop-list">
              {paradas.map((stop) => (
                <li key={stop.id} className={`stop stop-${stop.estado.toLowerCase()}`}>
                  <span className="stop-order-badge">{stop.orden}</span>
                  <div className="stop-body">
                    <div className="stop-head">
                      <strong className="mono">{stop.contenedor?.codigo ?? '—'}</strong>
                      <Chip
                        variant={
                          stop.estado === 'CONFIRMADA'
                            ? 'success'
                            : stop.estado === 'OMITIDA'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {STOP_STATE_LABEL[stop.estado]}
                      </Chip>
                      {stop.confirmadaEn && <span className="muted">{timeAgo(stop.confirmadaEn)}</span>}
                    </div>

                    {stop.contenedor && (
                      <div className="stop-fill">
                        <FillBar
                          levelPct={stop.contenedor.nivelLlenadoPct}
                          state={stop.contenedor.estado}
                          compact
                        />
                        <span className="muted mono">{stop.contenedor.nivelLlenadoPct}%</span>
                      </div>
                    )}

                    {canConfirmStop(stop) && (
                      <div className="stop-actions">
                        <Button
                          variant="success"
                          onClick={() => confirm(stop)}
                          disabled={confirmingId === stop.id || geo.status === GEO_STATUS.LOCATING}
                        >
                          {geo.status === GEO_STATUS.LOCATING && confirmingId === stop.id
                            ? 'Ubicando…'
                            : 'Confirmar vaciado'}
                        </Button>
                      </div>
                    )}

                    {feedback?.stopId === stop.id && (
                      <div className="stop-feedback">
                        <Notice type={feedback.type} title={feedback.title}>
                          {feedback.body}
                        </Notice>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}
