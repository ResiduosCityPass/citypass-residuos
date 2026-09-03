import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Notice from '../components/ui/Notice.jsx';
import FillBar from '../components/ui/FillBar.jsx';
import AlertRow from '../components/alerts/AlertRow.jsx';
import PredictionCard from '../components/containers/PredictionCard.jsx';
import { fetchContainer, fetchAlerts, acknowledgeAlert, resolveAlert } from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';
import {
  STATE_LABEL,
  WASTE_TYPE_LABEL,
  canPredict,
  colorForState,
  isActiveFire,
  timeAgo,
} from '../domain/states.js';

/**
 * CU-01 · Detalle del contenedor.
 *
 * Es la unica pantalla que muestra la zona y el sensor juntos, porque es la
 * unica que llama a GET /contenedores/:id, que los trae anidados. El payload del
 * mapa es flaco a proposito y el del listado no incluye sensor.
 */
export default function ContainerDetailPage({ onAlertsChanged }) {
  const { id } = useParams();
  const [container, setContainer] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    Promise.all([fetchContainer(id), fetchAlerts({ contenedorId: id })])
      .then(([detail, itsAlerts]) => {
        setContainer(detail);
        setAlerts(itsAlerts);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (action, alertId) => {
    await (action === 'acknowledge' ? acknowledgeAlert(alertId) : resolveAlert(alertId));
    load();
    onAlertsChanged?.();
  };

  if (loading) return <p className="muted">Cargando contenedor…</p>;

  if (error) {
    return (
      <div className="screen">
        <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>
        <Link to="/contenedores">← Volver al listado</Link>
      </div>
    );
  }

  const { zona, sensor } = container;
  const fire = alerts.find(isActiveFire);
  const unresolved = alerts.filter((a) => a.estado !== 'RESUELTA');

  return (
    <div className="screen">
      <Link to="/contenedores" className="back-link">← Contenedores</Link>

      {/* El incendio no depende del llenado: se evalua la temperatura contra el
          umbral de la zona. Un contenedor al 8% puede estar prendido fuego, y en
          esa pantalla el estado verde es la informacion menos importante. */}
      {fire && (
        <Notice type="error" title="Incendio detectado en este contenedor">
          {fire.detalle} · detectado {timeAgo(fire.detectadaEn)}.
          El estado de llenado no refleja esto: la temperatura se evalúa aparte.
        </Notice>
      )}

      <div className="detail">
        <section className="panel-card">
          <header className="detail-header">
            <div>
              <h2 className="mono">{container.codigo}</h2>
              <p className="muted">{WASTE_TYPE_LABEL[container.tipoResiduo]} · {container.capacidadLitros} L</p>
            </div>
            <Chip color={colorForState(container.estado)}>{STATE_LABEL[container.estado]}</Chip>
          </header>

          <FillBar
            levelPct={container.nivelLlenadoPct}
            thresholdPct={zona.umbralCriticoPct}
            state={container.estado}
          />
          <p className="muted fill-bar-note">
            {container.nivelLlenadoPct}% de llenado · umbral de {zona.nombre}: {zona.umbralCriticoPct}%
          </p>

          <dl className="data-list">
            <dt>Zona</dt>
            <dd>
              {zona.nombre}
              {zona.bloqueada && <Chip variant="warning">bloqueada</Chip>}
            </dd>

            <dt>Temperatura</dt>
            <dd>
              {container.temperaturaC === null ? '—' : `${container.temperaturaC} °C`}
              <span className="muted"> (umbral {zona.umbralTemperaturaC} °C)</span>
            </dd>

            <dt>Ubicacion</dt>
            <dd className="mono">{container.lat}, {container.lng}</dd>

            <dt>Ultima lectura</dt>
            <dd>{container.ultimaLecturaEn ? timeAgo(container.ultimaLecturaEn) : <span className="muted">nunca reportó</span>}</dd>
          </dl>

          <div className="detail-actions">
            {/* El estado existe en el enum y el motor de reglas lo respeta, pero
                no hay endpoint para ponerlo: PATCH /contenedores/:id no acepta
                `estado`. Se deja el boton a la vista, deshabilitado y con el
                motivo, en vez de fingir una funcionalidad que el backend no
                tiene. Es un pedido de contrato pendiente con Francisco. */}
            <Button
              variant="warning"
              disabled
              disabledReason="El backend todavía no expone un endpoint para cambiar el estado a FUERA_DE_SERVICIO"
            >
              Poner fuera de servicio
            </Button>
          </div>
        </section>

        <section className="panel-card">
          <h3>Sensor</h3>
          {sensor ? (
            <dl className="data-list">
              <dt>Codigo</dt><dd className="mono">{sensor.codigo}</dd>
              <dt>Estado</dt>
              <dd>
                <Chip variant={sensor.estado === 'ACTIVO' ? 'success' : 'warning'}>{sensor.estado}</Chip>
              </dd>
              <dt>Bateria</dt>
              <dd className={sensor.bateriaPct <= 20 ? 'text-warning' : undefined}>
                {sensor.bateriaPct}%
              </dd>
              <dt>Ultimo reporte</dt>
              <dd>{sensor.ultimoReporteEn ? timeAgo(sensor.ultimoReporteEn) : <span className="muted">nunca</span>}</dd>
            </dl>
          ) : (
            <Notice type="warning" title="Sin sensor vinculado">
              Este contenedor no reporta y su estado no va a cambiar nunca. El 0% que muestra no
              significa que esté vacío.
            </Notice>
          )}

          {/* CU-12. Solo se pide si el contenedor tiene de donde predecir: sin
              lecturas, la regresion no existe y la llamada seria un 409 buscado. */}
          {canPredict(container) && (
            <>
              <h3 className="spaced">Predicción de saturación</h3>
              <PredictionCard containerId={container.id} thresholdPct={zona.umbralCriticoPct} />
            </>
          )}

          <h3 className="spaced">Alertas ({unresolved.length} sin resolver)</h3>
          {alerts.length === 0 ? (
            <p className="muted">Ninguna alerta registrada para este contenedor.</p>
          ) : (
            <ul className="alert-list">
              {alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onAction={act} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
