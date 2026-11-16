import { useEffect, useRef, useState } from 'react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import { fetchAnalyticsDashboard } from '../api/waste.js';

/** Mensaje con el que el tablero de Analitica avisa su altura (guia del Grupo 8). */
const HEIGHT_MESSAGE = 'citypass-tablero-altura';

/**
 * Metricas de Residuos: el tablero que arma Analitica (Grupo 8).
 *
 * Los numeros no se calculan aca. Salen de los eventos que Residuos publica en
 * el bus, asi que un tablero vacio no es un error de esta pantalla.
 *
 * El tablero no se carga por URL: Analitica valida el token del admin y no
 * habilita CORS para el navegador. Lo pide nuestro backend, que devuelve el HTML
 * con los datos adentro, y aca se muestra en un iframe con `srcDoc`.
 *
 * `sandbox="allow-scripts"` sin `allow-same-origin` es a proposito, como pide
 * Analitica: el tablero corre sus graficos pero no puede leer la sesion de la
 * app ni tocar esta pagina. No lo necesita, porque los datos ya vienen adentro.
 */
export default function MetricsPage() {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [height, setHeight] = useState(null);
  const frame = useRef(null);

  useEffect(() => {
    let current = true;
    fetchAnalyticsDashboard()
      .then(({ html }) => current && setState({ status: 'ready', html }))
      .catch((error) => current && setState({ status: 'failed', error }));
    return () => { current = false; };
  }, [attempt]);

  // El tablero avisa su altura para no tener doble scroll. Solo se le cree al
  // iframe propio: cualquier otra ventana puede mandar mensajes. Sin
  // allow-same-origin, un iframe con srcDoc tiene origen opaco, que llega como
  // el texto "null"; un mensaje con otro origen no es del tablero.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== 'null') return;
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.tipo !== HEIGHT_MESSAGE) return;
      const altura = Number(event.data.altura);
      if (Number.isFinite(altura) && altura > 0) setHeight(altura);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (state.status === 'failed' && state.error?.code === 'ANALITICA_NO_CONFIGURADA') {
    return (
      <div className="screen">
        <Notice type="info" title="El dashboard todavía no está conectado">
          Las métricas de Residuos se van a ver acá cuando se configure la conexión con Analítica.
        </Notice>
      </div>
    );
  }

  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  };

  return (
    <div className="screen screen-metrics">
      {state.status === 'failed' && (
        <Notice type="error" title="No se pudo cargar el dashboard">
          {state.error?.status === 403
            ? 'Solo un administrador puede ver el tablero de Analítica.'
            : state.error?.message ?? 'Analítica no respondió.'}
        </Notice>
      )}

      <div className="filter-bar">
        <div className="filter-bar-right">
          <Button size="sm" variant="secondary" onClick={retry} disabled={state.status === 'loading'}>
            {state.status === 'failed' ? 'Reintentar' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {state.status !== 'failed' && (
        <div className="metrics-frame" style={height ? { height } : undefined}>
          {state.status === 'loading' && (
            <div className="metrics-loading" role="status">
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
              <span>Cargando el dashboard…</span>
            </div>
          )}
          {state.status === 'ready' && (
            <iframe
              ref={frame}
              srcDoc={state.html}
              title="Dashboard de métricas de Residuos"
              sandbox="allow-scripts"
            />
          )}
        </div>
      )}
    </div>
  );
}
