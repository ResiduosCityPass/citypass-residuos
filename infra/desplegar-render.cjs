const { setTimeout: dormir } = require('node:timers/promises');
const { appendFileSync } = require('node:fs');

const SHA = /^[a-f0-9]{40}$/;
const DEFAULTS = { timeoutMs: 20 * 60_000, intervalMs: 15_000, requestTimeoutMs: 15_000 };
class EstadoPendiente extends Error {}

function urlSegura(value) {
  try {
    const url = new URL(value);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username || url.password || url.hash) throw new Error();
    return url;
  } catch {
    throw new Error('URL de despliegue invalida');
  }
}

function validar(config) {
  if (!SHA.test(config.commit ?? '')) throw new Error('Se requiere un commit Git completo (40 caracteres hexadecimales)');
  for (const key of ['apiUrl', 'frontendUrl']) urlSegura(config[key]);
  for (const key of ['timeoutMs', 'intervalMs', 'requestTimeoutMs']) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`${key} debe ser un entero positivo`);
  }
}

// Nunca se imprime la URL del hook ni su respuesta: contienen credenciales.
async function dispararHook(hook, commit, nombre, fetchImpl, timeoutMs) {
  const url = urlSegura(hook);
  url.searchParams.set('ref', commit);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(`${nombre}: no se pudo activar el deploy de Render`);
  }
  const status = response.status;
  await response.body?.cancel();
  if (status !== 200 && status !== 202) throw new Error(`${nombre}: Render rechazo el deploy (HTTP ${status})`);
}

async function leer(url, tipo, deps, timeoutMs) {
  const response = await deps.fetch(url, {
    redirect: 'error', cache: 'no-store',
    signal: AbortSignal.any([deps.signal, AbortSignal.timeout(timeoutMs)]),
    headers: { Accept: tipo === 'json' ? 'application/json' : '*/*' },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new EstadoPendiente(`HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (tipo === 'json' && !contentType.includes('application/json')) throw new EstadoPendiente('se esperaba JSON');
  if (tipo === 'html' && !contentType.includes('text/html')) throw new EstadoPendiente('se esperaba HTML');
  if (tipo === 'js' && !/(?:application|text)\/javascript/.test(contentType)) throw new EstadoPendiente('se esperaba JavaScript');
  return tipo === 'json' ? response.json() : response.text();
}

function sinCache(base, path, nonce) {
  const url = new URL(path, base);
  url.searchParams.set('_deploy_check', nonce);
  return url;
}

async function comprobarApi(config, deps, nonce, timeoutMs) {
  const data = await leer(sinCache(config.apiUrl, '/api/v1/health', nonce), 'json', deps, timeoutMs);
  if (data?.status !== 'ok' || data?.service !== 'residuos-service') throw new EstadoPendiente('health no disponible');
  if (data.commit !== config.commit) throw new EstadoPendiente('el health todavia no informa el commit esperado');
}

async function comprobarFrontend(config, deps, nonce, timeoutMs) {
  const version = await leer(sinCache(config.frontendUrl, '/version.json', nonce), 'json', deps, timeoutMs);
  if (version?.commit !== config.commit) throw new EstadoPendiente('version.json todavia no informa el commit esperado');
  const html = await leer(sinCache(config.frontendUrl, '/', nonce), 'html', deps, timeoutMs);
  if (!html.includes(`<meta name="citypass-build-commit" content="${config.commit}">`)) {
    throw new EstadoPendiente('el HTML todavia no pertenece al commit esperado');
  }
  const src = html.match(/<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
  if (!src) throw new EstadoPendiente('el HTML no tiene un JavaScript principal');
  const asset = new URL(src, config.frontendUrl);
  if (asset.origin !== new URL(config.frontendUrl).origin ||
      !asset.pathname.startsWith('/assets/') || !asset.pathname.endsWith('.js')) {
    throw new EstadoPendiente('ruta del JavaScript principal invalida');
  }
  asset.searchParams.set('_deploy_check', nonce);
  const js = await leer(asset, 'js', deps, timeoutMs);
  if (!js.trim() || /^\s*</.test(js)) throw new EstadoPendiente('el JavaScript principal esta vacio o contiene HTML');
}

async function esperarDespliegue(input, overrides = {}) {
  const config = { ...DEFAULTS, ...input };
  validar(config);
  const deps = { fetch, dormir, ahora: Date.now, log: console.log, ...overrides };
  const deadline = deps.ahora() + config.timeoutMs;
  deps.signal = AbortSignal.timeout(config.timeoutMs);
  let ultimo = [];
  let intento = 0;
  while (deps.ahora() < deadline) {
    const nonce = `${config.commit}-${deps.ahora()}-${++intento}`;
    const timeout = Math.max(1, Math.min(config.requestTimeoutMs, deadline - deps.ahora()));
    const resultados = await Promise.allSettled([
      comprobarApi(config, deps, nonce, timeout),
      comprobarFrontend(config, deps, nonce, timeout),
    ]);
    ultimo = resultados.map((r, i) => `${i === 0 ? 'API' : 'Frontend'}: ${
      r.status === 'fulfilled' ? 'version verificada' :
        r.reason instanceof EstadoPendiente ? r.reason.message :
          r.reason instanceof SyntaxError ? 'JSON invalido' : 'sin respuesta valida'
    }`);
    deps.log(ultimo.join(' | '));
    if (resultados.every(r => r.status === 'fulfilled') && deps.ahora() <= deadline) return;
    const remaining = deadline - deps.ahora();
    if (remaining > 0) await deps.dormir(Math.min(config.intervalMs, remaining));
  }
  throw new Error(`Tiempo agotado esperando ${config.commit}. ${ultimo.join(' | ')}`);
}

async function desplegar(input, overrides = {}) {
  const config = { ...DEFAULTS, ...input };
  validar(config);
  // Validar ambos antes de disparar cualquiera de los dos.
  for (const key of ['apiHook', 'frontendHook']) urlSegura(config[key]);
  const fetchImpl = overrides.fetch ?? fetch;
  await dispararHook(config.apiHook, config.commit, 'API', fetchImpl, config.requestTimeoutMs);
  await dispararHook(config.frontendHook, config.commit, 'Frontend', fetchImpl, config.requestTimeoutMs);
  await esperarDespliegue(config, overrides);
}

async function main() {
  const config = {
    commit: process.env.GITHUB_SHA,
    apiUrl: process.env.DEPLOY_API_URL,
    frontendUrl: process.env.DEPLOY_FRONTEND_URL,
    apiHook: process.env.RENDER_DEPLOY_HOOK_API,
    frontendHook: process.env.RENDER_DEPLOY_HOOK_FRONTEND,
    ...(process.env.DEPLOY_TIMEOUT_MS && { timeoutMs: Number(process.env.DEPLOY_TIMEOUT_MS) }),
    ...(process.env.DEPLOY_INTERVAL_MS && { intervalMs: Number(process.env.DEPLOY_INTERVAL_MS) }),
    ...(process.env.DEPLOY_REQUEST_TIMEOUT_MS && { requestTimeoutMs: Number(process.env.DEPLOY_REQUEST_TIMEOUT_MS) }),
  };
  const summary = process.env.GITHUB_STEP_SUMMARY;
  try {
    await desplegar(config);
    const message = `API y frontend publicados y verificados en el commit ${config.commit}.`;
    console.log(message);
    if (summary) appendFileSync(summary, `## Deploy en Render verificado\n\n${message}\n`);
  } catch (error) {
    console.error(error.message);
    if (summary) appendFileSync(summary, '## Deploy en Render fallido\n\nNo se pudo verificar la version esperada en ambos servicios. Revisar el log y Render.\n');
    process.exitCode = 1;
  }
}

module.exports = { desplegar, esperarDespliegue };
if (require.main === module) void main();
