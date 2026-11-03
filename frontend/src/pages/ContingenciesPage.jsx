import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchFloods, fetchZones, fetchRoutes, simulateFloodStart, simulateFloodEnd, enableFloodRecovery } from '../api/waste.js';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Field from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import { FLOOD_STATE_LABEL, FLOOD_STATE_CHIP, pendingRecoveryCount } from '../domain/contingencies.js';
import { generalMessage } from '../domain/errors.js';
import './ContingenciesPage.css';

export default function ContingenciesPage() {
  const [data, setData] = useState({ contingencias: [], simuladorHabilitado: false });
  const [zones, setZones] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(null);
  const [description, setDescription] = useState('');
  const [zoneIds, setZoneIds] = useState([]);

  const load = useCallback(async () => {
    try {
      const [floods, itsZones, itsRoutes] = await Promise.all([fetchFloods(), fetchZones(), fetchRoutes()]);
      setData(floods);
      setZones(itsZones);
      setRoutes(itsRoutes);
      setError(null);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Carga inicial y sincronizacion con el backend.
    // oxlint-disable-next-line react/set-state-in-effect
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (key, operation, message) => {
    setBusy(key);
    setError(null);
    setFeedback('');
    try {
      await operation();
      setFeedback(message);
      await load();
    } catch (e) { setError(e); }
    finally { setBusy(null); }
  };

  const start = (e) => {
    e.preventDefault();
    return act('inicio', async () => {
      await simulateFloodStart({ descripcion: description.trim(), zonaIds: zoneIds });
      setDescription('');
      setZoneIds([]);
    }, 'Inundación registrada. La recolección queda suspendida en las zonas afectadas.');
  };

  return (
    <div className="screen flood-screen">
      <Notice type="info" title="Suspensión y recuperación por inundación">
        Las paradas suspendidas siguen pendientes y los contenedores conservan su llenado y sus alertas.
        Al finalizar la inundación, revisá las condiciones y habilitá la recuperación.
      </Notice>
      <div className="filter-bar">
        <Link to="/contingencias/clima">Revisar eventos de Espacios Públicos</Link>
        <Link to="/rutas">Ver rutas de recolección</Link>
        <Button variant="secondary" onClick={load} disabled={Boolean(busy)}>Actualizar</Button>
        <span className="muted">Se actualiza cada 15 s</span>
      </div>
      {error && <Notice type="error" title={`[${error.code ?? 'ERROR'}]`}>{generalMessage(error) ?? error.message}</Notice>}
      {feedback && <Notice type="success">{feedback}</Notice>}
      {loading && <p className="muted">Cargando contingencias…</p>}

      {data.simuladorHabilitado && (
        <section className="panel-card flood-simulator" aria-label="Simulador de inundaciones">
          <h2>Simulador de eventos</h2>
          <p className="muted">Entorno de desarrollo. Estos eventos modifican la operación de Residuos.</p>
          <form onSubmit={start}>
            <Field label="Descripción de la inundación" htmlFor="flood-description" required>
              <input id="flood-description" value={description} onChange={(e) => setDescription(e.target.value)} minLength={3} maxLength={200} required disabled={Boolean(busy)} />
            </Field>
            <fieldset disabled={Boolean(busy)}>
              <legend>Zonas afectadas</legend>
              <div className="flood-zones">
                {zones.map((zone) => (
                  <label key={zone.id}>
                    <input type="checkbox" checked={zoneIds.includes(zone.id)} onChange={(e) => setZoneIds((ids) => e.target.checked ? [...ids, zone.id] : ids.filter((id) => id !== zone.id))} />
                    {zone.nombre}{zone.bloqueoManual ? ' · bloqueo manual' : zone.bloqueada ? ' · bloqueo por emergencia' : ''}
                  </label>
                ))}
              </div>
              {zones.length === 0 && <p>Creá al menos una zona para simular una inundación.</p>}
            </fieldset>
            <Button type="submit" disabled={Boolean(busy) || description.trim().length < 3 || zoneIds.length === 0} disabledReason="Ingresá una descripción y elegí al menos una zona">
              {busy === 'inicio' ? 'Enviando evento…' : 'Simular inicio de inundación'}
            </Button>
          </form>
        </section>
      )}

      {!loading && !error && data.contingencias.length === 0 && <Notice type="info" title="No hay inundaciones registradas">Las contingencias aparecerán acá cuando se reciban sus eventos.</Notice>}

      <div className="flood-list">
        {data.contingencias.map((flood) => {
          const pending = pendingRecoveryCount(flood);
          const affectedRoutes = routes.filter((r) => r.contingenciaIds?.includes(flood.id));
          return (
            <article className="panel-card" key={flood.id} aria-label={flood.descripcion}>
              <header className="detail-header">
                <h2>{flood.descripcion}</h2>
                <Chip variant={FLOOD_STATE_CHIP[flood.estado]}>{FLOOD_STATE_LABEL[flood.estado]}</Chip>
              </header>
              <p className="muted">Zonas: {flood.zonas.map((z) => z.zona?.nombre ?? z.zonaId).join(', ')}</p>
              <p>{pending} contenedor(es) pendientes de recuperación · {affectedRoutes.length} ruta(s) con paradas suspendidas</p>
              {flood.estado === 'ACTIVA' && <p>La recolección permanece suspendida hasta recibir la finalización y habilitar la recuperación.</p>}
              {flood.estado === 'PENDIENTE_RECUPERACION' && <Notice type="warning" title="La inundación finalizó">Revisá que se pueda recolectar antes de habilitar. Los bloqueos manuales y otras inundaciones seguirán vigentes.</Notice>}
              {flood.estado === 'EN_RECUPERACION' && <Notice type="info" title="Recuperación habilitada">Retomá las paradas existentes o generá propuestas para los contenedores sin ruta. Se incluyen aunque no estén críticos. Omitir una parada no cuenta como vaciado.</Notice>}
              {flood.estado === 'RECUPERADA' && <p>Se completaron los vaciados pendientes de esta contingencia.</p>}

              <div className="actions-cell">
                {data.simuladorHabilitado && flood.estado === 'ACTIVA' && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => act(flood.id, () => simulateFloodEnd(flood.id), 'Finalización recibida. Falta habilitar la recuperación.')}>
                  Simular finalización
                </Button>}
                {flood.estado === 'PENDIENTE_RECUPERACION' && <Button variant="success" disabled={Boolean(busy)} onClick={() => act(flood.id, () => enableFloodRecovery(flood.id), 'Recuperación habilitada. Se conservan las demás restricciones.')}>
                  Habilitar recuperación
                </Button>}
                {flood.estado === 'EN_RECUPERACION' && <Link to="/rutas">Planificar recuperación</Link>}
              </div>
              {affectedRoutes.length > 0 && <ul>{affectedRoutes.map((route) => <li key={route.id}><Link to={`/rutas/${route.id}`}>{route.camion?.patente ?? 'Ruta'} · {route.paradasSuspendidas} parada(s) suspendidas</Link></li>)}</ul>}
              {(flood.contenedores?.length ?? 0) > 0 && <details>
                <summary>Ver contenedores y avance</summary>
                <ul className="flood-containers">{flood.contenedores.map((item) => <li key={item.contenedorId}>
                  <Link to={`/contenedores/${item.contenedorId}`}>{item.contenedor?.codigo ?? item.contenedorId}</Link>
                  <span>{item.vaciadoEn ? 'Vaciado confirmado' : 'Pendiente de vaciado'}</span>
                </li>)}</ul>
              </details>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
