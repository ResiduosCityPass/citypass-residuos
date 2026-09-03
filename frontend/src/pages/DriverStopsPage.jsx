import { useCallback, useEffect, useState } from 'react';
import RouteMap from '../components/routes/RouteMap.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import FillBar from '../components/ui/FillBar.jsx';
import Notice from '../components/ui/Notice.jsx';
import { fetchMyRoute, confirmStop } from '../api/waste.js';
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

/**
 * Permite confirmar usando la posicion del contenedor en vez de la del GPS.
 *
 * Es un bypass del unico control que tiene este caso de uso, asi que vive en su
 * propia variable de entorno, apagada por defecto y fuera de cualquier build
 * que no sea una demo. Antes colgaba de USING_MOCKS, y al conectar el backend
 * real desaparecia: los contenedores del seed estan en el Obelisco y cualquiera
 * que pruebe desde su casa esta a kilometros, con lo cual CU-10 no se podia
 * mostrar funcionando ni una vez.
 */
const SIMULAR_GPS = import.meta.env.VITE_SIMULAR_GPS === 'true';

export default function DriverStopsPage() {
  const geo = useGeolocation();

  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [confirmingId, setConfirmingId] = useState(null);
  const [feedback, setFeedback] = useState(null); // { stopId, type, title, body }
  const [simulateGps, setSimulateGps] = useState(false);

  // Sin argumentos: el chofer sale del `sub` del token. No hay forma de pedir
  // la ruta de otro, que es exactamente el punto.
  //
  // El backend devuelve cuerpo vacio con 200 cuando no hay ruta activa, y
  // client.js lo convierte en `null`. Terminar el turno no es un error.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchMyRoute()
      .then(setRoute)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // La carga inicial es la sincronizacion con el backend, no un derivado.
    // oxlint-disable-next-line react/set-state-in-effect
    load();
  }, [load]);

  const paradas = route?.paradas ?? [];
  const { confirmed, total } = stopsProgress(paradas);

  /**
   * La posicion que se manda. Se pide FRESCA en cada confirmacion en vez de
   * reusar la ultima: el chofer se movio entre una parada y la siguiente.
   *
   * El simulador esta gateado por VITE_SIMULAR_GPS, apagada por defecto: en
   * produccion seria un bypass del unico control que tiene este caso de uso.
   * Existe porque los contenedores del seed estan en CABA y cualquiera que
   * pruebe la demo esta a kilometros, asi que sin esto el camino feliz no se
   * puede mostrar nunca.
   */
  const positionFor = (stop) => {
    if (SIMULAR_GPS && simulateGps && stop.contenedor) {
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
      // La respuesta trae la transicion entera. `alertasCerradas` es un NUMERO,
      // no una lista de ids: el id de una alerta ya cerrada no le sirve a nadie
      // parado en la vereda, y devolverlo obligaba a cargar entidades enteras
      // para descartarlas.
      const result = await confirmStop(stop.id, { lat: position.lat, lng: position.lng });
      const closed = result?.alertasCerradas ?? 0;
      const done = result?.rutaEstado === 'COMPLETADA';

      setFeedback({
        stopId: stop.id,
        type: 'success',
        title: done ? 'Última parada: ruta completa' : 'Vaciado confirmado',
        body: [
          'El contenedor volvió a 0%.',
          closed === 1 ? 'Se cerró 1 alerta.' : closed > 1 ? `Se cerraron ${closed} alertas.` : null,
          done ? 'El camión ya quedó disponible.' : null,
        ]
          .filter(Boolean)
          .join(' '),
      });
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
      } else if (err.code === 'PARADA_DE_OTRA_RUTA') {
        // Un chofer solo confirma paradas de SU ruta. Si llega este error la
        // pantalla esta mostrando una ruta que ya no le corresponde —se la
        // reasignaron mientras la tenia abierta—, asi que se recarga: dejarlo
        // mirando paradas ajenas lo hace insistir con un boton que no puede
        // funcionar.
        setFeedback({
          stopId: stop.id,
          type: 'error',
          title: 'Esta parada no es de tu ruta',
          body: 'Puede que te hayan reasignado. Estamos recargando tu ruta actual.',
        });
        await load();
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
        {/* El selector de chofer ya no existe: la ruta sale del token y no hay
            forma de pedir la de otro. Lo unico que queda es el simulador de
            GPS, y solo si la variable de entorno lo habilita. */}
        {SIMULAR_GPS && (
          <div className="panel-card demo-panel">
            <Notice type="warning" title="Simulación de GPS activa">
              Las confirmaciones pueden usar la posición del contenedor en vez de la tuya. Es solo
              para la demo: apagá VITE_SIMULAR_GPS antes de entregar.
            </Notice>

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
