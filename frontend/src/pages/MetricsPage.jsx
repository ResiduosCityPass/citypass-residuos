import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useOperatorSession } from '../auth/SessionContext.js';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';

export const LOAD_TIMEOUT_MS = 65000;
const puedeVer = (user) => ['ADMINISTRADOR', 'OPERADOR'].includes(user?.rol);

function Tablero({ user, retry }) {
  const frame = useRef(null);
  const [result, setResult] = useState({ status: 'loading' });
  const [height, setHeight] = useState(1200);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      active = false;
      controller.abort();
      setResult({ status: 'failed' });
    }, LOAD_TIMEOUT_MS);
    (async () => {
      // En modo local no hay SessionContext: consultamos el rol verificado por
      // la API. Nunca se autoriza usando el payload de un JWT sin verificar.
      const identity = user ?? await api.get('/auth/sesion', undefined, { signal: controller.signal, cache: 'no-store' });
      if (!active) return;
      if (!puedeVer(identity)) {
        setResult({ status: 'forbidden' });
        return;
      }
      const { html } = await api.get('/metricas/tablero', undefined, {
        signal: controller.signal, cache: 'no-store', redirect: 'error',
      });
      if (typeof html !== 'string' || !html.trim()) throw new Error('Tablero vacío');
      if (active) setResult({ status: 'ready', html });
    })().catch((error) => {
      if (!active) return;
      setResult({
        status: error.code === 'ANALITICA_NO_CONFIGURADA' ? 'unconfigured'
          : error.status === 403 ? 'forbidden' : 'failed',
      });
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [user]);

  useEffect(() => {
    const resize = (event) => {
      const source = frame.current?.contentWindow;
      // srcdoc + sandbox tiene origen opaco: se verifica la ventana emisora.
      if (!source || event.source !== source || event.data?.tipo !== 'citypass-tablero-altura') return;
      if (!Number.isFinite(event.data.altura) || event.data.altura <= 0) return;
      setHeight(Math.min(10000, Math.max(320, Math.ceil(event.data.altura))));
    };
    window.addEventListener('message', resize);
    return () => window.removeEventListener('message', resize);
  }, []);

  return (
    <div className="screen screen-metrics">
      {result.status === 'forbidden' && (
        <Notice type="warning" title="Sin acceso al tablero">
          Tu cuenta necesita permisos de administrador u operador de Residuos y acceso al tablero en Analítica.
        </Notice>
      )}
      {result.status === 'unconfigured' && (
        <Notice type="info" title="El tablero todavía no está conectado">
          Las métricas se van a ver acá cuando esté habilitada la conexión con Analítica.
        </Notice>
      )}
      {result.status === 'failed' && (
        <Notice type="error" title="Analítica no disponible">
          No se pudo cargar el tablero. Volvé a intentar en unos minutos.
        </Notice>
      )}
      <div className="filter-bar">
        <p className="muted">Indicadores actualizados una vez por día. Informe semanal los lunes.</p>
        <div className="filter-bar-right">
          {result.status !== 'loading' && result.status !== 'forbidden' && (
            <Button size="sm" onClick={retry}>{result.status === 'ready' ? 'Actualizar tablero' : 'Reintentar'}</Button>
          )}
        </div>
      </div>
      {result.status === 'loading' && (
        <div className="metrics-frame" aria-busy="true">
          <div className="metrics-loading" role="status">
            <span className="skeleton" /><span className="skeleton" /><span className="skeleton" />
            <span>Cargando el tablero…</span>
          </div>
        </div>
      )}
      {result.status === 'ready' && (
        <div className="metrics-frame">
          <iframe ref={frame} srcDoc={result.html} title="Dashboard de métricas de Residuos"
            sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ height }} />
        </div>
      )}
    </div>
  );
}

export default function MetricsPage() {
  const user = useOperatorSession();
  const [attempt, setAttempt] = useState(0);
  // Un cambio de identidad/rol o un reintento desmonta el HTML anterior.
  return <Tablero key={`${user?.sub}:${user?.rol}:${attempt}`} user={user}
    retry={() => setAttempt((value) => value + 1)} />;
}
