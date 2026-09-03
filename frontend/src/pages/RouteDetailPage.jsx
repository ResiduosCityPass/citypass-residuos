import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Field from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import FillBar from '../components/ui/FillBar.jsx';
import RouteMap from '../components/routes/RouteMap.jsx';
import { fetchRoute, assignRoute } from '../api/waste.js';
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

  // Solo la ruta. Antes tambien pedia el listado de choferes en el mismo
  // Promise.all, y como ese endpoint no existe en el backend, el 404 hacia
  // fallar los dos y la pantalla no cargaba ni la ruta.
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
          {/* La ruta trae `choferId` y nada mas. No hay objeto `chofer` porque
              los choferes son usuarios del directorio del Squad 2 y este modulo
              no guarda una copia de sus datos: mostrar el identificador es todo
              lo que se puede decir con la verdad. */}
          {route.choferId ? (
            <dl className="data-list">
              <dt>Identificador</dt><dd className="mono">{route.choferId}</dd>
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
                     error={fieldErrors(assignError).choferId}
                     hint="Al confirmar, la ruta pasa a ASIGNADA y el camión queda tomado.">
                <input
                  id="choferId"
                  className="mono"
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  placeholder="identificador del chofer"
                />
              </Field>

              <Button variant="success" onClick={confirm} disabled={assigning || !driverId}>
                {assigning ? 'Asignando…' : 'Confirmar y asignar'}
              </Button>

              {/* Se escribe a mano porque no hay de donde sacar una lista.
                  `choferId` es el `sub` del JWT del chofer y el backend no lo
                  valida contra ningun padron: un identificador mal tipeado
                  asigna la ruta igual, y el chofer no la ve nunca. */}
              <Notice type="warning" title="El identificador se escribe a mano">
                No hay endpoint para listar los usuarios con rol CHOFER: son del directorio del
                Squad 2, no de este módulo. El backend acepta el identificador sin validarlo, así
                que revisá que esté bien antes de confirmar. Pedido de contrato pendiente con
                Nicolás y Adriel.
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
