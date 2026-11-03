import { sinBarrasFinales } from '../domain/url.js';

const KEY = 'citypass.federated-session';
let memory = null;
let revision = 0;
let refreshing = null;
export const federatedEnabled = () => import.meta.env.VITE_AUTH_MODE === 'federated';

export function readSession() {
  try { return memory ?? JSON.parse(sessionStorage.getItem(KEY) || 'null'); }
  catch { return memory; }
}
function store(pair) {
  memory = pair;
  try {
    if (pair) sessionStorage.setItem(KEY, JSON.stringify(pair));
    else sessionStorage.removeItem(KEY);
  } catch { /* Con storage bloqueado la sesion dura hasta recargar. */ }
  window.dispatchEvent(new Event('citypass:session'));
}
/** Solo invalida el estado local: sirve tambien ante un refresh ya revocado. */
export function clearSession() { revision += 1; store(null); }
export const subscribeSession = (callback) => {
  window.addEventListener('citypass:session', callback);
  return () => window.removeEventListener('citypass:session', callback);
};
export const accessToken = () => readSession()?.access_token ?? '';

function configuration() {
  const clientId = import.meta.env.VITE_IDP_CLIENT_ID?.trim();
  const origin = import.meta.env.VITE_IDP_URL && sinBarrasFinales(import.meta.env.VITE_IDP_URL);
  if (!origin) throw new Error('Falta configurar el servicio de Login.');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('La URL de Login debe usar HTTPS y no incluir credenciales.');
  }
  return { origin, clientId };
}
async function callIdp(path, body) {
  const { origin } = configuration();
  let response;
  try {
    response = await fetch(`${origin}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
  } catch { throw new Error('No se pudo contactar al servicio de Login. Intentá nuevamente.'); }
  if (!response.ok) {
    const error = new Error(response.status === 401
      ? 'Usuario o contraseña incorrectos, o sesión vencida.'
      : 'Login no pudo completar la solicitud. Verificá la configuración e intentá nuevamente.');
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const pair = await response.json();
  if (!pair || typeof pair.access_token !== 'string' || !pair.access_token ||
      typeof pair.refresh_token !== 'string' || !pair.refresh_token) {
    throw new Error('Login devolvió una sesión incompleta.');
  }
  const expiresIn = pair.expires_in ?? 900;
  if (!Number.isFinite(expiresIn) || expiresIn <= 120) throw new Error('Login devolvió una vigencia de sesión inválida.');
  return { access_token: pair.access_token, refresh_token: pair.refresh_token, expiresAt: Date.now() + expiresIn * 1000 };
}
async function revoke(refreshToken) {
  if (!refreshToken) return;
  try { await callIdp('/auth/logout', { refreshToken }); }
  catch { /* Se borra la sesion local aun si el IdP no esta disponible. */ }
}
export async function logout() {
  const refreshToken = readSession()?.refresh_token;
  clearSession();
  await revoke(refreshToken);
}
export async function login(username, password) {
  const { clientId } = configuration();
  if (!clientId) throw new Error('Falta configurar el cliente de Residuos con Login.');
  const version = ++revision;
  const pair = await callIdp('/auth/login', { username: username.trim(), password, clientId });
  if (revision !== version) { await revoke(pair.refresh_token); throw new Error('El inicio de sesión fue cancelado.'); }
  store(pair);
}
/** Un solo refresh por token; respuestas tardias no deshacen un logout. */
export async function renewAccessToken(rejectedToken) {
  const current = readSession();
  if (current?.access_token && current.access_token !== rejectedToken) return current.access_token;
  if (!current?.refresh_token) return '';
  if (refreshing?.token === current.refresh_token) return refreshing.promise;
  const version = revision;
  const pending = {
    token: current.refresh_token,
    promise: (async () => {
      try {
        const pair = await callIdp('/auth/refresh', { refreshToken: current.refresh_token });
        if (revision !== version) { await revoke(pair.refresh_token); return ''; }
        store(pair);
        return pair.access_token;
      } catch (error) {
        if (revision === version && [400, 401, 403].includes(error.status)) clearSession();
        throw error;
      } finally { if (refreshing === pending) refreshing = null; }
    })(),
  };
  refreshing = pending;
  return pending.promise;
}
/** Renueva a los ~13 min, al volver a la pestaña o ante el 401 manejado por la API. */
export function startSessionRefresh() {
  if (!federatedEnabled()) return () => {};
  let timer;
  let stopped = false;
  const run = async () => {
    try { await renewAccessToken(accessToken()); }
    catch { if (!stopped && accessToken()) timer = setTimeout(run, 30000); }
  };
  const schedule = () => {
    clearTimeout(timer);
    const session = readSession();
    if (!stopped && session?.access_token) {
      timer = setTimeout(run, Math.max(0, (session.expiresAt ?? Date.now() + 900000) - Date.now() - 120000));
    }
  };
  const visible = () => { if (document.visibilityState === 'visible') schedule(); };
  const unsubscribe = subscribeSession(schedule);
  document.addEventListener('visibilitychange', visible);
  schedule();
  return () => { stopped = true; clearTimeout(timer); unsubscribe(); document.removeEventListener('visibilitychange', visible); };
}
