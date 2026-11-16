import { apiSameOrigin, sameOriginApiBase } from './client.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validView(view) {
  return typeof view?.vistaId === 'string' && UUID.test(view.vistaId)
    && view.url === `${sameOriginApiBase()}/metricas/tableros/${view.vistaId}`;
}

export async function prepareAnalyticsView({ signal, verificar = false } = {}) {
  const view = await apiSameOrigin.post('/metricas/tableros', { verificar }, {
    signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
  });
  if (!validView(view)) throw new Error('La API no devolvió una vista válida del tablero.');
  return view;
}

export function releaseAnalyticsView(view) {
  if (!validView(view)) return;
  // No se necesita Bearer para eliminar solo la cookie de esta vista. Permite
  // limpiarla incluso si el usuario ya cerro sesion o vencio el access token.
  void fetch(view.url, { method: 'DELETE', credentials: 'same-origin',
    cache: 'no-store', redirect: 'error', keepalive: true }).catch(() => {});
}
