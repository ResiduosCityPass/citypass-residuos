import { useEffect, useState } from 'react';
import { fetchContainer, fetchAlerts } from '../api/waste.js';
import {
  colorForState,
  STATE_LABEL,
  WASTE_TYPE_LABEL,
  ALERT_STATE_CLASS,
  SEVERITY_CLASS,
  timeAgo,
} from '../domain/states.js';

/**
 * Panel de detalle. El payload del mapa es flaco a proposito, asi que al hacer
 * click pedimos GET /contenedores/:id, que trae `zona` y `sensor` anidados.
 */
export default function ContainerPanel({ containerId, onClose, refreshedAt }) {
  const [container, setContainer] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // MapPage monta este panel con key={containerId}, asi que cambiar de contenedor
  // remonta el componente y el estado arranca limpio sin resetearlo a mano.
  useEffect(() => {
    let current = true;

    Promise.all([fetchContainer(containerId), fetchAlerts({ contenedorId: containerId })])
      .then(([detail, itsAlerts]) => {
        if (!current) return;
        setContainer(detail);
        setAlerts(itsAlerts);
      })
      .catch((e) => current && setError(e))
      .finally(() => current && setLoading(false));

    return () => {
      current = false;
    };
    // `refreshedAt` cambia en cada tick del polling: asi el panel abierto no
    // queda mostrando datos viejos mientras el mapa ya se actualizo.
  }, [containerId, refreshedAt]);

  if (loading) return <aside className="panel"><p className="muted">Cargando…</p></aside>;

  if (error) {
    return (
      <aside className="panel">
        <button className="close" onClick={onClose}>×</button>
        <p className="notice notice-error">{error.message}</p>
      </aside>
    );
  }

  const threshold = container.zona.umbralCriticoPct;
  const open = alerts.filter((a) => a.estado !== 'RESUELTA');

  return (
    <aside className="panel">
      <button className="close" onClick={onClose}>×</button>

      <h2>{container.codigo}</h2>
      <span className="chip" style={{ background: colorForState(container.estado) }}>
        {STATE_LABEL[container.estado]}
      </span>

      {/* "94% sobre un umbral de 70" se entiende mucho mejor que solo "94%". */}
      <div className="fill-bar">
        <div
          className="fill-bar-value"
          style={{ width: `${container.nivelLlenadoPct}%`, background: colorForState(container.estado) }}
        />
        <div
          className="fill-bar-threshold"
          style={{ left: `${threshold}%` }}
          title={`Umbral de la zona: ${threshold}%`}
        />
      </div>
      <p className="muted fill-bar-note">
        {container.nivelLlenadoPct}% de llenado · umbral de {container.zona.nombre}: {threshold}%
      </p>

      <dl className="data-list">
        <dt>Zona</dt>
        <dd>{container.zona.nombre}{container.zona.bloqueada && <span className="chip-mini">bloqueada</span>}</dd>

        <dt>Residuo</dt>
        <dd>{WASTE_TYPE_LABEL[container.tipoResiduo]}</dd>

        <dt>Capacidad</dt>
        <dd>{container.capacidadLitros} L</dd>

        <dt>Temperatura</dt>
        <dd>
          {container.temperaturaC === null ? '—' : `${container.temperaturaC} °C`}
          <span className="muted"> (umbral {container.zona.umbralTemperaturaC} °C)</span>
        </dd>

        <dt>Ultima lectura</dt>
        <dd>{timeAgo(container.ultimaLecturaEn)}</dd>

        <dt>Sensor</dt>
        <dd>
          {container.sensor ? (
            <>
              {container.sensor.codigo} · {container.sensor.estado} · bateria {container.sensor.bateriaPct}%
            </>
          ) : (
            /* Sin sensor no hay lecturas, y sin lecturas el estado no cambia nunca. */
            <span className="text-warning">Sin sensor vinculado — este contenedor no reporta</span>
          )}
        </dd>
      </dl>

      <h3>Alertas ({open.length} sin resolver)</h3>
      {alerts.length === 0 && <p className="muted">Ninguna alerta registrada.</p>}
      <ul className="alert-list">
        {alerts.map((alert) => (
          <li key={alert.id} className={`alert alert-${ALERT_STATE_CLASS[alert.estado]}`}>
            <div className="alert-header">
              <strong>{alert.tipo}</strong>
              <span className={`chip-mini sev-${SEVERITY_CLASS[alert.severidad]}`}>{alert.severidad}</span>
              <span className="muted">{alert.estado}</span>
            </div>
            {/* `detalle` viene ya redactado para el operador: se muestra tal cual. */}
            <p>{alert.detalle}</p>
            <span className="muted">{timeAgo(alert.detectadaEn)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
