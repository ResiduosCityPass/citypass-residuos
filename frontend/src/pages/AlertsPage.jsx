import { useCallback, useEffect, useState } from 'react';
import Notice from '../components/ui/Notice.jsx';
import Button from '../components/ui/Button.jsx';
import AlertRow from '../components/alerts/AlertRow.jsx';
import {
  fetchAlerts,
  fetchContainers,
  acknowledgeAlert,
  resolveAlert,
} from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';
import {
  ALERT_TYPE_LABEL,
  ALERT_STATE_LABEL,
  SEVERITY_LABEL,
  isActiveFire,
} from '../domain/states.js';

/**
 * CU-05 y CU-06 · Tablero de alertas.
 *
 * Dos cosas que hay que tener claras leyendo esta pantalla:
 *
 * 1. **El estado del contenedor y la alerta son cosas distintas.** La alerta se
 *    genera UNA vez, en la transicion al cruzar el umbral, no en cada lectura.
 *    Si el sensor sigue reportando 81%, 87%, 94%, no aparecen alertas nuevas: la
 *    de 76% sigue abierta mientras el nivel del contenedor sube. Por eso el
 *    detalle de una alerta puede decir 76% y el mapa mostrar 94%.
 *
 * 2. **El incendio no depende del llenado.** Se evalua la temperatura contra el
 *    umbral de la zona, asi que un contenedor verde al 5% puede tener una alerta
 *    CRITICA abierta. Es el caso que no se puede pasar por alto y por eso las
 *    alertas de incendio se destacan aparte, arriba de la lista.
 */
export default function AlertsPage({ onAlertsChanged }) {
  const [alerts, setAlerts] = useState([]);
  const [containers, setContainers] = useState([]);
  const [filters, setFilters] = useState({ tipo: '', severidad: '', estado: '', contenedorId: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // `loading` arranca en true y solo se apaga: no se vuelve a prender en cada
  // recarga. Un esqueleto parpadeando sobre una lista que ya tiene datos se lee
  // como un error, y despues de accionar la lista ya esta en pantalla.
  const load = useCallback(() => {
    fetchAlerts(filters)
      .then((list) => {
        setAlerts(list);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Los contenedores ya no se cruzan contra las alertas —cada alerta trae su
  // `contenedorCodigo`—, asi que lo unico que llenan es el <select> del filtro.
  // Por eso se piden UNA vez al montar y no en cada `load()`: antes viajaban
  // enteros en cada cambio de filtro y despues de atender o resolver.
  useEffect(() => {
    fetchContainers().then(setContainers).catch(() => setContainers([]));
  }, []);

  const act = async (action, alertId) => {
    await (action === 'acknowledge' ? acknowledgeAlert(alertId) : resolveAlert(alertId));
    load();
    onAlertsChanged?.();
  };

  const changeFilter = (field) => (e) =>
    setFilters((previous) => ({ ...previous, [field]: e.target.value }));

  const fires = alerts.filter(isActiveFire);
  const rest = alerts.filter((a) => !isActiveFire(a));

  return (
    <div className="screen">
      <div className="filter-bar">
        <select value={filters.tipo} onChange={changeFilter('tipo')} aria-label="Filtrar por tipo">
          <option value="">Todo tipo de alerta</option>
          {Object.entries(ALERT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <select value={filters.severidad} onChange={changeFilter('severidad')} aria-label="Filtrar por severidad">
          <option value="">Toda severidad</option>
          {Object.entries(SEVERITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <select value={filters.estado} onChange={changeFilter('estado')} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          {Object.entries(ALERT_STATE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <select value={filters.contenedorId} onChange={changeFilter('contenedorId')} aria-label="Filtrar por contenedor">
          <option value="">Todos los contenedores</option>
          {containers.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}
        </select>

        <div className="filter-bar-right">
          <Button variant="secondary" size="sm" onClick={load}>Refrescar</Button>
        </div>
      </div>

      {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}

      {loading && <p className="muted">Cargando alertas…</p>}

      {!loading && fires.length > 0 && (
        <section className="fire-block">
          <h3>Incendios sin resolver ({fires.length})</h3>
          <p className="muted">
            Máxima prioridad. Estos contenedores pueden estar en verde en el mapa: el estado
            refleja el llenado, no la temperatura.
          </p>
          <ul className="alert-list">
            {fires.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                containerCode={alert.contenedorCodigo}
                onAction={act}
              />
            ))}
          </ul>
        </section>
      )}

      {!loading && (
        <section>
          <h3>Alertas ({rest.length})</h3>
          {rest.length === 0 ? (
            <p className="muted">No hay alertas para estos filtros.</p>
          ) : (
            <ul className="alert-list">
              {rest.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  containerCode={alert.contenedorCodigo}
                  onAction={act}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
