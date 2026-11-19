const { test } = require('node:test');
const assert = require('node:assert/strict');
const { desplegar, esperarDespliegue } = require('./desplegar-render.cjs');

const COMMIT = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const config = {
  commit: COMMIT, apiUrl: 'https://api.example', frontendUrl: 'https://web.example',
  apiHook: 'https://api.render.com/deploy/api?key=secreto&ref=anterior',
  frontendHook: 'https://api.render.com/deploy/web?key=otro-secreto',
  timeoutMs: 30, intervalMs: 10, requestTimeoutMs: 20,
};
const json = data => Response.json(data);
const html = commit => `<html><head><meta name="citypass-build-commit" content="${commit}"></head><body><script type="module" crossorigin src="/assets/index-123.js"></script></body></html>`;
const texto = (data, type) => new Response(data, { headers: { 'Content-Type': type } });

function entorno(custom = () => undefined) {
  let time = 0;
  const calls = [], logs = [], sleeps = [];
  return {
    calls, logs, sleeps,
    deps: {
      ahora: () => time,
      dormir: async ms => { sleeps.push(ms); time += ms; },
      log: message => logs.push(message),
      fetch: async (input, options) => {
        const url = new URL(input);
        calls.push({ url, options });
        const response = await custom(url, options, time);
        if (response !== undefined) return response;
        if (options.method === 'POST') return json({ id: 'deploy' });
        if (url.pathname === '/api/v1/health') return json({ status: 'ok', service: 'residuos-service', commit: COMMIT });
        if (url.pathname === '/version.json') return json({ commit: COMMIT });
        if (url.pathname === '/') return texto(html(COMMIT), 'text/html');
        return texto('console.log("app")', 'application/javascript');
      },
    },
  };
}

test('fija ambos hooks al SHA, conserva sus claves y verifica las dos aplicaciones', async () => {
  const e = entorno();
  await desplegar(config, e.deps);
  const posts = e.calls.filter(c => c.options.method === 'POST');
  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map(c => c.url.searchParams.get('ref')), [COMMIT, COMMIT]);
  assert.deepEqual(posts.map(c => c.url.searchParams.get('key')), ['secreto', 'otro-secreto']);
  assert(e.calls.some(c => c.url.pathname === '/assets/index-123.js'));
  assert.equal(e.sleeps.length, 0);
  for (const call of e.calls.filter(c => c.options.method !== 'POST')) {
    assert.equal(call.options.cache, 'no-store');
    assert(call.url.searchParams.has('_deploy_check'));
    assert.equal(call.options.redirect, 'error');
  }
  assert(!e.logs.join().includes('secreto'));
});

test('espera el arranque y las versiones nuevas de ambos servicios', async () => {
  const e = entorno((url, _options, time) => {
    if (url.pathname === '/api/v1/health' && time === 0) return new Response('', { status: 503 });
    if (url.pathname === '/version.json' && time < 20) return json({ commit: OLD });
  });
  await esperarDespliegue(config, e.deps);
  assert.deepEqual(e.sleeps, [10, 10]);
});

test('vuelve a comprobar la API mientras espera el frontend (no conserva un exito viejo)', async () => {
  const e = entorno((url, _options, time) => {
    if (url.pathname === '/version.json' && time === 0) return json({ commit: OLD });
    if (url.pathname === '/api/v1/health' && time === 10) return json({ status: 'ok', service: 'residuos-service', commit: OLD });
  });
  await esperarDespliegue(config, e.deps);
  assert.equal(e.sleeps.length, 2);
});

for (const [name, override, expected] of [
  ['API con commit viejo', url => url.pathname === '/api/v1/health' ? json({ status: 'ok', service: 'residuos-service', commit: OLD }) : undefined, /el health todavia/],
  ['health degradado', url => url.pathname === '/api/v1/health' ? json({ status: 'error', commit: COMMIT }) : undefined, /health no disponible/],
  ['frontend con commit viejo', url => url.pathname === '/version.json' ? json({ commit: OLD }) : undefined, /version.json todavia/],
  ['fallback SPA en version.json', url => url.pathname === '/version.json' ? texto(html(COMMIT), 'text/html') : undefined, /se esperaba JSON/],
  ['JSON corrupto', url => url.pathname === '/version.json' ? texto('{', 'application/json') : undefined, /JSON invalido/],
  ['HTML anterior con metadata nueva', url => url.pathname === '/' ? texto(html(OLD), 'text/html') : undefined, /el HTML todavia/],
  ['HTML sin bundle', url => url.pathname === '/' ? texto(html(COMMIT).replace(/<script.*<\/script>/, ''), 'text/html') : undefined, /no tiene un JavaScript/],
  ['bundle faltante', url => url.pathname.includes('/assets/') ? new Response('', { status: 404 }) : undefined, /HTTP 404/],
  ['fallback HTML en el bundle', url => url.pathname.includes('/assets/') ? texto(html(COMMIT), 'text/html') : undefined, /se esperaba JavaScript/],
  ['bundle vacio', url => url.pathname.includes('/assets/') ? texto('', 'text/javascript') : undefined, /JavaScript principal esta vacio/],
  ['bundle externo', url => url.pathname === '/' ? texto(html(COMMIT).replace('/assets/index-123.js', 'https://otro.example/assets/index.js'), 'text/html') : undefined, /ruta del JavaScript/],
]) {
  test(`no da por publicado: ${name}`, async () => {
    const e = entorno(override);
    await assert.rejects(esperarDespliegue(config, e.deps), expected);
    assert.deepEqual(e.sleeps, [10, 10, 10]);
  });
}

test('reintenta un corte de red sin incluir detalles de la conexion en los logs', async () => {
  const e = entorno((_url, _options, time) => {
    if (time === 0) throw new Error('red: https://privado.example?key=secreto');
  });
  await esperarDespliegue(config, e.deps);
  assert(!e.logs.join().includes('privado'));
  assert.equal(e.sleeps.length, 1);
});

test('acepta un deploy encolado por Render (202)', async () => {
  const e = entorno((_url, options) => options.method === 'POST' ? new Response('', { status: 202 }) : undefined);
  await desplegar(config, e.deps);
});

test('no reintenta un POST rechazado ni verifica una version que no pudo desplegar', async () => {
  const e = entorno((_url, options) => options.method === 'POST' ? new Response('detalle secreto', { status: 401 }) : undefined);
  await assert.rejects(desplegar(config, e.deps), /API: Render rechazo el deploy \(HTTP 401\)/);
  assert.equal(e.calls.length, 1);
});

test('un timeout del hook falla sin revelar su URL ni reintentar el POST', async () => {
  const e = entorno(() => { throw new Error(config.apiHook); });
  await assert.rejects(desplegar(config, e.deps), error => !error.message.includes('secreto') && /no se pudo activar/.test(error.message));
  assert.equal(e.calls.length, 1);
});

for (const patch of [{ commit: 'main' }, { commit: '' }, { intervalMs: 0 }, { timeoutMs: NaN }, { frontendHook: '' }, { apiHook: 'http://api.render.com/?key=secreto' }]) {
  test(`valida configuracion antes de tocar Render: ${JSON.stringify(Object.keys(patch))}`, async () => {
    const e = entorno();
    await assert.rejects(desplegar({ ...config, ...patch }, e.deps));
    assert.equal(e.calls.length, 0);
  });
}

test('el timeout de una consulta HTTP libera el verificador y termina en error', async () => {
  // El temporizador mantiene vivo el test mientras AbortSignal.timeout (unref) actua.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(esperarDespliegue({ ...config, timeoutMs: 40, intervalMs: 5, requestTimeoutMs: 10 }, {
      log: () => {},
      fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    }), /Tiempo agotado/);
  } finally {
    clearInterval(keepAlive);
  }
});
