import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { prepareAnalyticsView, releaseAnalyticsView } from '../api/analytics.js';
import { useOperatorSession } from '../auth/SessionContext.js';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';

export const LOAD_TIMEOUT_MS = 65000;
const puedeVer = (user) => ['ADMINISTRADOR', 'OPERADOR'].includes(user?.rol);

function Tablero({ user, retry }) {
  const frame = useRef(null);
  const loaded = useRef(() => {});
  const [result, setResult] = useState({ status: 'loading' });
  const [height, setHeight] = useState(1200);

  useEffect(() => {
    let active = true;
    let phase = 'loading';
    let refreshed = false;
    let timer;
    const views = new Set();
    const controller = new AbortController();
    const releaseAll = () => { views.forEach((view) => releaseAnalyticsView(view)); views.clear(); };
    const fail = (error) => {
      if (!active) return;
      clearTimeout(timer); releaseAll(); phase = 'failed';
      setResult({ status: error?.code === 'ANALITICA_NO_CONFIGURADA' ? 'unconfigured'
        : error?.status === 403 ? 'forbidden' : 'failed' });
    };
    const startTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fail(); active = false; controller.abort();
      }, LOAD_TIMEOUT_MS);
    };
    const prepare = async (verificar = false) => {
      const view = await prepareAnalyticsView({ signal: controller.signal, verificar });
      if (!active) { releaseAnalyticsView(view); return; }
      releaseAll(); views.add(view);
      phase = 'loading-frame'; setResult({ status: phase, view }); startTimeout();
    };
    loaded.current = () => {
      if (!active || phase !== 'loading-frame') return;
      clearTimeout(timer); phase = 'ready';
      setResult((current) => ({ ...current, status: 'ready' }));
    };
    const message = (event) => {
      if (event.origin !== 'null') return;
      const source = frame.current?.contentWindow;
      if (!source || event.source !== source || !active) return;
      if (event.data?.tipo === 'citypass-tablero-altura') {
        if (!Number.isFinite(event.data.altura) || event.data.altura <= 0) return;
        setHeight(Math.min(10000, Math.max(320, Math.ceil(event.data.altura))));
      } else if (event.data?.tipo === 'citypass-analitica-error') {
        if (event.data.estado === 401 && !refreshed) {
          refreshed = true; phase = 'renewing';
          setResult((current) => ({ ...current, status: 'renewing' })); startTimeout();
          // El POST con verificar usa el cliente compartido: si Analitica
          // rechaza el token, Login lo renueva y se reintenta una sola vez.
          void prepare(true).catch(fail);
        } else {
          fail({ status: event.data.estado });
        }
      }
    };
    window.addEventListener('message', message);
    startTimeout();
    (async () => {
      const identity = user ?? await api.get('/auth/sesion', undefined, { signal: controller.signal, cache: 'no-store' });
      if (!active) return;
      if (!puedeVer(identity)) { fail({ status: 403 }); return; }
      await prepare();
    })().catch(fail);
    return () => {
      active = false; clearTimeout(timer); controller.abort(); releaseAll();
      window.removeEventListener('message', message); loaded.current = () => {};
    };
  }, [user]);

  const loading = ['loading', 'loading-frame', 'renewing'].includes(result.status);
  return (
    <div className="screen screen-metrics">
      {result.status === 'forbidden' && <Notice type="warning" title="Sin acceso al tablero">
        Tu cuenta necesita permisos de administrador u operador de Residuos y acceso al tablero en Analítica.
      </Notice>}
      {result.status === 'unconfigured' && <Notice type="info" title="El tablero todavía no está conectado">
        Las métricas se van a ver acá cuando esté habilitada la conexión con Analítica.
      </Notice>}
      {result.status === 'failed' && <Notice type="error" title="Analítica no disponible">
        No se pudo cargar el tablero. Volvé a intentar en unos minutos.
      </Notice>}
      <div className="filter-bar">
        <p className="muted">Indicadores actualizados una vez por día. Informe semanal los lunes.</p>
        <div className="filter-bar-right">
          {!loading && result.status !== 'forbidden' && <Button size="sm" onClick={retry}>
            {result.status === 'ready' ? 'Actualizar tablero' : 'Reintentar'}
          </Button>}
        </div>
      </div>
      {(loading || result.view) && <div className="metrics-frame" aria-busy={loading}>
        {loading && <div className="metrics-loading" role="status">
          <span className="skeleton" /><span className="skeleton" /><span className="skeleton" />
          <span>Cargando el tablero…</span>
        </div>}
        {result.view && <iframe key={result.view.vistaId} ref={frame} src={result.view.url}
          title="Dashboard de métricas de Residuos" sandbox="allow-scripts"
          referrerPolicy="no-referrer" style={{ height }}
          onLoad={(event) => { if (event.currentTarget === frame.current) loaded.current(); }} />}
      </div>}
    </div>
  );
}

export default function MetricsPage() {
  const user = useOperatorSession();
  const [attempt, setAttempt] = useState(0);
  return <Tablero key={`${user?.sub}:${user?.rol}:${attempt}`} user={user}
    retry={() => setAttempt((value) => value + 1)} />;
}
