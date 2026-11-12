import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchClimateAlerts, fetchZones, resolveClimateAlert, simulateClimateEvent } from '../api/waste.js';
import { climateAlertIsCurrent } from '../domain/climate-alerts.js';
import { FLOOD_STATE_LABEL } from '../domain/contingencies.js';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Field from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import './ContingenciesPage.css';

const CONFIRMED = 'com.citypass.espacios.CriticidadClimaticaConfirmada';
const ENDED = 'com.citypass.espacios.CriticidadClimaticaFinalizada';
const date = (value) => value == null ? 'Sin informar' : new Date(value).toLocaleString('es-AR');

function ReviewAlert({ alert, zones, busy, onResolve }) {
  const [selected, setSelected] = useState([]);
  const [reason, setReason] = useState('');
  const start = alert.confirmacion;
  const pending = alert.decision === 'PENDIENTE_REVISION';
  return <article className="panel-card" aria-label={`Alerta ${alert.alertaId}`}>
    <header className="detail-header"><h2>{start?.fenomeno?.replaceAll('_', ' ') ?? 'Finalización recibida antes del inicio'}</h2>
      <Chip variant={pending ? 'warning' : 'info'}>{alert.contingenciaId ? (FLOOD_STATE_LABEL[alert.estadoContingencia] ?? 'Suspensión registrada') : pending ? 'Pendiente de revisión' : 'Sin afectación'}</Chip>
    </header>
    <p className="muted">ID: {alert.alertaId} · {alert.origen === 'eda-simulacro' ? 'SIMULACRO de Residuos recibido por EDA' : alert.origen === 'simulador' ? 'Simulado en Residuos' : 'Recibido de EDA'}</p>
    {start && <>
      <p>Criticidad: {start.nivelCriticidad} · Desde: {date(start.vigenciaDesde)} · Hasta estimado: {date(start.vigenciaHasta)}</p>
      <p>{alert.origen === 'eda-simulacro' ? 'Puntos del simulacro:' : 'Puntos informados por Espacios Públicos:'}</p>
      {start.barrios?.length > 0 && <p>Barrios informados: {start.barrios.join(', ')}</p>}
      <ul>{start.ubicaciones.map((point, index) => <li key={index}>Latitud {point.latitud}, longitud {point.longitud}</li>)}</ul>
    </>}
    {alert.finalizacion && <Notice type="info">Finalización recibida: {date(alert.finalizacion.finalizadaEn)}. La recuperación requiere habilitación del operador.</Notice>}
    {!start && <p>Se conserva la finalización. Cuando llegue la confirmación se podrá evaluar su afectación.</p>}
    {pending && start && <form onSubmit={(event) => { event.preventDefault(); onResolve(alert.alertaId, { accion: 'SUSPENDER', motivo: reason.trim(), zonaIds: selected }); }}>
      <Notice type="warning" title="Confirmá la afectación antes de suspender">
        Los puntos recibidos no delimitan un área. Verificá si las condiciones climáticas impiden recolectar y elegí las zonas correspondientes.
        Hasta confirmar, esta alerta no suspende la recolección.
      </Notice>
      <fieldset disabled={busy}><legend>Zonas de Residuos afectadas</legend><div className="flood-zones">
        {zones.map((zone) => <label key={zone.id}><input type="checkbox" checked={selected.includes(zone.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, zone.id] : ids.filter((id) => id !== zone.id))} />{zone.nombre}</label>)}
      </div></fieldset>
      <Field label="Fundamento de la decisión" htmlFor={`reason-${alert.alertaId}`} required>
        <textarea id={`reason-${alert.alertaId}`} value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={300} required disabled={busy} />
      </Field>
      <div className="actions-cell">
        <Button type="submit" disabled={busy || selected.length === 0 || reason.trim().length < 10}>Confirmar suspensión del servicio</Button>
        <Button type="button" variant="secondary" disabled={busy || reason.trim().length < 10} onClick={() => onResolve(alert.alertaId, { accion: 'SIN_AFECTACION', motivo: reason.trim() })}>Registrar sin afectación en Residuos</Button>
      </div>
    </form>}
    {alert.motivo && <p>Revisión: {alert.motivo} · {date(alert.revisadaEn)}</p>}
    {alert.contingenciaId && <Link to="/contingencias">Ver suspensión y recuperación</Link>}
  </article>;
}

export default function ClimateEventsPage({ embedded = false, onAlertsChanged }) {
  const [data, setData] = useState({ alertas: [], simuladorHabilitado: false });
  const [zones, setZones] = useState([]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState(CONFIRMED);
  const [payload, setPayload] = useState('');
  const load = useCallback(async () => {
    try {
      const [alerts, allZones] = await Promise.all([fetchClimateAlerts(), fetchZones()]);
      setData(alerts); setZones(allZones); setError('');
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);
  const act = async (operation, message) => {
    setBusy(true); setError(''); setFeedback('');
    try { await operation(); setFeedback(message); await load(); onAlertsChanged?.(); }
    catch (e) { setError(e instanceof SyntaxError ? 'El payload debe ser un JSON válido.' : e.message); }
    finally { setBusy(false); }
  };
  const resolve = (id, decision) => act(() => resolveClimateAlert(id, decision), decision.accion === 'SUSPENDER' ? 'Suspensión registrada en las zonas seleccionadas.' : 'Alerta revisada sin afectación.');
  return <div className={embedded ? "flood-screen" : "screen flood-screen"}>
    <Notice type="info" title={embedded ? undefined : "Eventos climáticos de Espacios Públicos"}>
      Cada alerta se revisa para determinar su impacto en Residuos. La fecha de fin estimada no levanta restricciones: se espera el evento de finalización.
    </Notice>
    <div className="filter-bar"><Link to="/contingencias">Ver suspensiones y recuperación</Link><Button variant="secondary" onClick={load} disabled={busy}>Actualizar</Button></div>
    {!embedded && data.integracion && <Notice type={data.integracion.estado === 'ERROR' ? 'error' : 'info'} title={`Recepción EDA: ${{ DESHABILITADO: 'deshabilitada', CONECTANDO: 'conectando', CONECTADO: 'Kafka conectado', ERROR: 'requiere atención' }[data.integracion.estado]}`}>
      {data.integracion.ultimoError ?? (data.integracion.estado === 'DESHABILITADO' ? 'Este entorno permite probar los eventos con el simulador local.' : 'Los mensajes se confirman en Kafka después de guardarlos en Residuos.')}
    </Notice>}
    {!embedded && data.integracion?.simulacroHabilitado && <Notice type="warning" title={data.integracion.simulacrosPendientesRegistro?.length ? 'Simulacros de Residuos pendientes de registro' : 'Simulacros de Residuos por EDA habilitados'}>
      {data.integracion.simulacrosPendientesRegistro?.length
        ? 'Los tipos de prueba todavía no están disponibles en EDA. La recepción de alertas de Espacios Públicos sigue habilitada.'
        : 'Este entorno también recibe eventos de prueba publicados por Residuos. Se identifican como SIMULACRO y requieren la misma revisión del operador.'}
    </Notice>}
    {error && <Notice type="error">{error}</Notice>}
    {feedback && <Notice type="success">{feedback}</Notice>}
    {data.simuladorHabilitado && <details className="panel-card flood-simulator"><summary>Probar el contrato de Espacios Públicos</summary>
      <p className="muted">Simulación local: conserva el payload recibido y modifica la operación de Residuos. No publica mensajes en EDA.</p>
      <form onSubmit={(event) => { event.preventDefault(); void act(() => simulateClimateEvent({ tipo: type, payload: JSON.parse(payload) }), 'Evento procesado. Las reentregas idénticas no repiten acciones.'); }}>
        <Field label="Tipo de evento" htmlFor="climate-type"><select id="climate-type" value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
          <option value={CONFIRMED}>CriticidadClimaticaConfirmada</option><option value={ENDED}>CriticidadClimaticaFinalizada</option>
        </select></Field>
        <Field label="Payload JSON de Espacios Públicos" htmlFor="climate-payload"><textarea id="climate-payload" rows={12} value={payload} onChange={(e) => setPayload(e.target.value)} required disabled={busy} /></Field>
        <Button type="submit" disabled={busy || !payload.trim()}>Procesar evento de prueba</Button>
      </form>
    </details>}
    {data.alertas.length === 0 && <p className="muted">No hay alertas climáticas recibidas.</p>}
    <div className="flood-list">{data.alertas.filter((alert) => climateAlertIsCurrent(alert)).map((alert) => <ReviewAlert key={alert.alertaId} alert={alert} zones={zones} busy={busy} onResolve={resolve} />)}</div>
    {data.alertas.some((alert) => !climateAlertIsCurrent(alert)) && <details className="panel-card">
      <summary>Alertas climáticas revisadas ({data.alertas.filter((alert) => !climateAlertIsCurrent(alert)).length})</summary>
      <div className="flood-list">{data.alertas.filter((alert) => !climateAlertIsCurrent(alert)).map((alert) => <ReviewAlert key={alert.alertaId} alert={alert} zones={zones} busy={busy} onResolve={resolve} />)}</div>
    </details>}
  </div>;
}
