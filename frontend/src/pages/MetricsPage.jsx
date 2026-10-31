import { useEffect, useState } from 'react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';

/**
 * Cuanto se le da al dashboard para cargar antes de decir que no responde. Los
 * dashboards de BI tardan: con un servicio dormido, el primer pedido puede
 * llevar varios segundos sin que este caido.
 */
export const LOAD_TIMEOUT_MS = 20000;

/**
 * Metricas de Residuos: el dashboard que arma Analitica, embebido en un iframe.
 *
 * Los numeros no se calculan aca. Salen de los eventos que Residuos publica en
 * el bus, asi que un dashboard vacio no es un error de esta pantalla.
 *
 * Un iframe no avisa si fallo: no existe `onError` y `onLoad` tambien dispara
 * cuando el navegador pinta su propia pagina de error o el sitio prohibe que lo
 * embeban (X-Frame-Options). Lo unico detectable es que nunca termine de cargar,
 * y de ahi el timeout. Para el resto queda siempre visible el enlace que abre el
 * dashboard en otra pestaña.
 *
 * El iframe sigue montado cuando se vence el plazo: si contesta tarde, la
 * pantalla se recupera sola.
 */
export default function MetricsPage({ dashboardUrl = import.meta.env.VITE_BI_DASHBOARD_URL }) {
  const [status, setStatus] = useState('loading');
  // Cambiar la key del iframe es la unica forma de recargarlo: con otro origen
  // no se puede llamar a `contentWindow.location.reload()`.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!dashboardUrl) return undefined;
    const timer = setTimeout(() => {
      setStatus((current) => (current === 'loading' ? 'failed' : current));
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [dashboardUrl, attempt]);

  if (!dashboardUrl) {
    return (
      <div className="screen">
        <Notice type="info" title="El dashboard todavía no está conectado">
          Las métricas de Residuos se van a ver acá cuando Analítica entregue su dashboard.
        </Notice>
      </div>
    );
  }

  const retry = () => {
    setStatus('loading');
    setAttempt((current) => current + 1);
  };

  return (
    <div className="screen screen-metrics">
      {status === 'failed' && (
        <Notice type="error" title="El dashboard no responde">
          Analítica no contestó a tiempo. Volvé a intentar en unos minutos.
        </Notice>
      )}

      <div className="filter-bar">
        <div className="filter-bar-right">
          {status === 'failed' && <Button size="sm" onClick={retry}>Reintentar</Button>}
          <a className="btn btn-secondary btn-sm" href={dashboardUrl} target="_blank" rel="noreferrer">
            Abrir en otra pestaña
          </a>
        </div>
      </div>

      <div className="metrics-frame" hidden={status === 'failed'}>
        {status === 'loading' && (
          <div className="metrics-loading" role="status">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
            <span>Cargando el dashboard…</span>
          </div>
        )}
        <iframe
          key={attempt}
          src={dashboardUrl}
          title="Dashboard de métricas de Residuos"
          // Sin allow-top-navigation: el dashboard no puede sacar al operador
          // de la app. Lo demas es lo que necesita cualquier herramienta de BI.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          onLoad={() => setStatus('ready')}
        />
      </div>
    </div>
  );
}
