import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Field from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import FillBar from '../components/ui/FillBar.jsx';
import RouteMap from '../components/routes/RouteMap.jsx';
import { fetchRoute, fetchDrivers, assignRoute } from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';
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
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignError, setAssignError] = useState(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchRoute(id), fetchDrivers()])
      .then(([itsRoute, itsDrivers]) => {
        setRoute(itsRoute);
        setDrivers(itsDrivers);
        setDriverId((current) => current || itsDrivers[0]?.id || '');
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

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

  const { camion, chofer, paradas } = route;

  // Cuanto se lleva el camion, segun el nivel actual de cada contenedor.
  const liters = paradas.reduce(
    (total, stop) =>
      total + (stop.contenedor ? (stop.contenedor.capacidadLitros * stop.contenedor.nivelLlenadoPct) / 100 : 0),
    0,
  );
  const usedPct = camion ? Math.round((liters / camion.capacidadLitros) * 100) : 0;

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
          {chofer ? (
            <dl className="data-list">
              <dt>Nombre</dt><dd>{chofer.nombre}</dd>
              <dt>Legajo</dt><dd className="mono">{chofer.legajo}</dd>
              <dt>Asignada</dt><dd>{route.asignadaEn ? timeAgo(route.asignadaEn) : '—'}</dd>
            </dl>
          ) : canAssign(route) ? (
            <>
              {assignError && (
                <Notice type="error" title={`[${assignError.code}]`}>
                  {generalMessage(assignError) ?? assignError.message}
                </Notice>
              )}

              <Field label="Asignar a" htmlFor="choferId" required
                     hint="Al confirmar, la ruta pasa a ASIGNADA y el camión queda tomado.">
                <select id="choferId" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.nombre} — legajo {driver.legajo}
                    </option>
                  ))}
                </select>
              </Field>

              <Button variant="success" onClick={confirm} disabled={assigning || !driverId}>
                {assigning ? 'Asignando…' : 'Confirmar y asignar'}
              </Button>

              {/* El listado de choferes no existe en el backend: `choferId` es un
                  usuario del directorio del Squad 2 y nadie expuso un endpoint
                  para enumerarlos. Se dice en pantalla en vez de disimularlo. */}
              <Notice type="info" title="Los choferes son de demostración">
                El backend no expone todavía un endpoint para listar usuarios con rol CHOFER: salen
                del directorio del Squad 2. Es un pedido de contrato pendiente.
              </Notice>
            </>
          ) : (
            <p className="muted">Sin chofer asignado.</p>
          )}
        </section>
      </div>
    </div>
  );
}
