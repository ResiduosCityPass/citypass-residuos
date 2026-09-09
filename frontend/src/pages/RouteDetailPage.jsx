import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Field from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import FillBar from '../components/ui/FillBar.jsx';
import RouteMap from '../components/routes/RouteMap.jsx';
import { fetchRoute, fetchDrivers, assignRoute } from '../api/waste.js';
import { fieldErrors, generalMessage } from '../domain/errors.js';
import {
  ROUTE_STATE_LABEL,
  ROUTE_STATE_CHIP,
  STOP_STATE_LABEL,
  WASTE_TYPE_LABEL,
  canAssign,
  timeAgo,
} from '../domain/states.js';

/**
 * CU-08 (revisar) y CU-09 (asignar).
 *
 * Son dos casos de uso y una sola pantalla, y esta bien que asi sea: la
 * separacion que pide el contrato es entre *generar* y *asignar*, no entre
 * mirar y decidir. Quien confirma tiene que poder ver el recorrido, el orden de
 * las paradas y cuanto se llena el camion, todo junto, antes de apretar el
 * boton. Si la heuristica propuso algo absurdo, este es el unico momento en que
 * alguien lo puede notar.
 */
export default function RouteDetailPage() {
  const { id } = useParams();
  const [route, setRoute] = useState(null);
  const [driverId, setDriverId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignError, setAssignError] = useState(null);
  const [assigning, setAssigning] = useState(false);

  const [drivers, setDrivers] = useState([]);
  const [driversError, setDriversError] = useState(null);
  // Arranca en true y no se prende dentro del efecto: el selector solo se
  // dibuja cuando la ruta se puede asignar, y para entonces el pedido ya salio.
  // Prenderlo adentro del efecto es un render de mas por nada.
  const [loadingDrivers, setLoadingDrivers] = useState(true);

  // La ruta se pide SOLA, aparte de los choferes. Antes los dos viajaban en el
  // mismo Promise.all y el listado de choferes ni siquiera existia: su 404
  // hacia fallar la promesa entera y la pantalla no mostraba ni la ruta. Ahora
  // el endpoint existe, pero la separacion se queda igual — mirar el recorrido
  // no tiene por que depender de que se pueda listar a quien asignarselo.
  const load = useCallback(() => {
    fetchRoute(id)
      .then((itsRoute) => {
        setRoute(itsRoute);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Solo si esta ruta se puede asignar: en una ruta ya asignada el listado no
  // llena nada y seria una llamada por pantalla sin nadie que la lea.
  const assignable = Boolean(route) && canAssign(route);

  useEffect(() => {
    if (!assignable) return;
    fetchDrivers()
      .then((itsDrivers) => {
        setDrivers(itsDrivers);
        setDriversError(null);
      })
      .catch(setDriversError)
      .finally(() => setLoadingDrivers(false));
  }, [assignable]);

  const confirm = async () => {
    setAssigning(true);
    setAssignError(null);
    try {
      await assignRoute(id, { choferId: driverId });
      load();
    } catch (e) {
      setAssignError(e);
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <p className="muted">Cargando ruta…</p>;

  if (error) {
    return (
      <div className="screen">
        <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>
        <Link to="/rutas">← Volver a rutas</Link>
      </div>
    );
  }

  const { camion, paradas } = route;

  // Cuanto se lleva el camion, segun el nivel actual de cada contenedor.
  const liters = paradas.reduce(
    (total, stop) =>
      total + (stop.contenedor ? (stop.contenedor.capacidadLitros * stop.contenedor.nivelLlenadoPct) / 100 : 0),
    0,
  );
  const usedPct = camion ? Math.round((liters / camion.capacidadLitros) * 100) : 0;

  const selectedDriver = drivers.find((driver) => driver.id === driverId) ?? null;

  return (
    <div className="screen">
      <Link to="/rutas" className="back-link">← Rutas</Link>

      {canAssign(route) && (
        <Notice type="warning" title="Esta ruta es una propuesta">
          Todavía no está asignada y ningún chofer la ve. La generó la heurística; revisá el orden
          de las paradas y la carga antes de confirmarla.
        </Notice>
      )}

      <div className="detail">
        <section className="panel-card">
          <header className="detail-header">
            <div>
              <h2>Recorrido</h2>
              <p className="muted">
                {paradas.length} paradas · {route.distanciaEstimadaKm} km estimados · sale y vuelve al depósito
              </p>
            </div>
            <Chip variant={ROUTE_STATE_CHIP[route.estado]}>{ROUTE_STATE_LABEL[route.estado]}</Chip>
          </header>

          <RouteMap stops={paradas} />

          <ol className="stop-list">
            {paradas.map((stop) => (
              <li key={stop.id} className={`stop stop-${stop.estado.toLowerCase()}`}>
                <span className="stop-order-badge">{stop.orden}</span>
                <div className="stop-body">
                  <div className="stop-head">
                    <strong className="mono">{stop.contenedor?.codigo ?? '—'}</strong>
                    <Chip variant={stop.estado === 'CONFIRMADA' ? 'success' : stop.estado === 'OMITIDA' ? 'warning' : 'neutral'}>
                      {STOP_STATE_LABEL[stop.estado]}
                    </Chip>
                    {(stop.confirmadaEn ?? stop.omitidaEn) && (
                      <span className="muted">{timeAgo(stop.confirmadaEn ?? stop.omitidaEn)}</span>
                    )}
                  </div>

                  {/* El motivo se le pide al chofer como obligatorio, y este es
                      el unico lugar donde el operador lo lee. Sin mostrarlo,
                      pedirlo no sirve para nada: la decision de si vuelve a
                      rutear este contenedor hoy o si el problema es de la
                      calle sale de aca. */}
                  {stop.estado === 'OMITIDA' && stop.motivo && (
                    <p className="stop-motivo">No se pudo vaciar: {stop.motivo}</p>
                  )}

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
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel-card">
          <h3>Camion</h3>
          {camion ? (
            <dl className="data-list">
              <dt>Patente</dt><dd className="mono">{camion.patente}</dd>
              <dt>Residuo</dt><dd>{WASTE_TYPE_LABEL[camion.tipoResiduoHabilitado]}</dd>
              <dt>Capacidad</dt><dd className="mono">{camion.capacidadLitros.toLocaleString('es-AR')} L</dd>
            </dl>
          ) : (
            <p className="muted">Sin camión asociado.</p>
          )}

          {/* La carga es el limite duro de la heuristica. Verla en barra dice de
              un vistazo si la propuesta aprovecha el viaje o manda el camion
              medio vacio. */}
          {camion && (
            <>
              <h3 className="spaced">Carga estimada</h3>
              <FillBar levelPct={usedPct} state={usedPct > 90 ? 'CRITICO' : 'NORMAL'} />
              <p className="muted fill-bar-note">
                {Math.round(liters).toLocaleString('es-AR')} L de{' '}
                {camion.capacidadLitros.toLocaleString('es-AR')} L · {usedPct}% del camión
              </p>
            </>
          )}

          <h3 className="spaced">Chofer</h3>
          {route.choferId ? (
            <dl className="data-list">
              {/* La ruta trae el chofer expandido. El legajo va ADEMAS del
                  nombre y no en su lugar: es lo unico que distingue a dos
                  personas que se llaman igual, y el operador que revisa una
                  ruta de ayer necesita saber a cual de las dos le tocó.

                  El `??` es defensa, no un caso esperado: el backend expande
                  siempre. Si algun dia llegara un `choferId` sin su chofer,
                  mostrar el uuid es mejor que un renglon vacio. */}
              <dt>Nombre</dt>
              <dd>{route.chofer?.nombre ?? <span className="mono">{route.choferId}</span>}</dd>
              {route.chofer && (
                <>
                  <dt>Legajo</dt><dd className="mono">{route.chofer.legajo}</dd>
                </>
              )}
              <dt>Asignada</dt><dd>{route.asignadaEn ? timeAgo(route.asignadaEn) : '—'}</dd>
            </dl>
          ) : canAssign(route) ? (
            <>
              {assignError && (
                <Notice type="error" title={`[${assignError.code}]`}>
                  {generalMessage(assignError) ?? assignError.message}
                </Notice>
              )}

              {/* Que el listado falle no rompe la pantalla —la ruta ya se ve—,
                  pero sí deja el selector vacío, y un <select> vacío sin
                  explicación se lee como "no hay choferes". */}
              {driversError && (
                <Notice type="error" title={`[${driversError.code}]`}>
                  No se pudo traer la lista de choferes.{' '}
                  {generalMessage(driversError) ?? driversError.message}
                </Notice>
              )}

              {!driversError && !loadingDrivers && drivers.length === 0 && (
                <Notice type="warning" title="No hay ningún chofer activo">
                  Esta ruta no se puede asignar hasta que se dé de alta uno. Los choferes dados de
                  baja no aparecen acá: no reciben rutas nuevas.
                </Notice>
              )}

              <Field label="Asignar a" htmlFor="choferId" required
                     error={fieldErrors(assignError).choferId}
                     hint="Al confirmar, la ruta pasa a ASIGNADA y el camión queda tomado.">
                {/* Antes era un input de texto libre y el backend no validaba
                    nada: un identificador mal tipeado asignaba la ruta CON
                    EXITO y el chofer no la veia nunca. La lista trae solo los
                    activos, que son los unicos que pueden recibir una ruta. */}
                <select
                  id="choferId"
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  disabled={loadingDrivers || drivers.length === 0}
                >
                  <option value="">
                    {loadingDrivers ? 'Cargando choferes…' : 'Elegí un chofer…'}
                  </option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.nombre} · {driver.legajo}
                    </option>
                  ))}
                </select>
              </Field>

              {/* La trampa que reemplaza a la del identificador mal tipeado, y
                  la unica que queda sin error visible: `usuarioSub` es lo que
                  une a la persona con su sesion, es opcional, y sin el la
                  asignacion funciona pero la pantalla del chofer queda vacia.
                  Se avisa ANTES de confirmar, que es el unico momento en que
                  alguien puede elegir a otro. */}
              {selectedDriver && !selectedDriver.usuarioSub && (
                <Notice type="warning" title={`${selectedDriver.nombre} todavía no tiene acceso`}>
                  Se le puede asignar igual y la ruta queda a su nombre, pero no la va a ver en su
                  pantalla hasta que alguien le emita una credencial.
                </Notice>
              )}

              <Button variant="success" onClick={confirm} disabled={assigning || !driverId}>
                {assigning ? 'Asignando…' : 'Confirmar y asignar'}
              </Button>
            </>
          ) : (
            <p className="muted">Sin chofer asignado.</p>
          )}
        </section>
      </div>
    </div>
  );
}
