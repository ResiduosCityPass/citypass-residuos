const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

const COMMIT = process.env.GITHUB_SHA || 'a'.repeat(40);
const OLD = COMMIT === 'b'.repeat(40) ? 'c'.repeat(40) : 'b'.repeat(40);

async function ejecutar(t, { version = COMMIT, assetStatus = 200, hookStatus = 200 } = {}) {
  const temp = await mkdtemp(path.join(tmpdir(), 'citypass-deploy-test-'));
  const requests = [];
  let healthCalls = 0;
  // Se puede ejecutar la misma prueba contra los archivos producidos por Vite.
  const dist = process.env.FRONTEND_DIST;
  const index = dist ? await readFile(path.join(dist, 'index.html'), 'utf8') :
    `<html><head><meta name="citypass-build-commit" content="${COMMIT}"></head><body><script type="module" src="/assets/index-test.js"></script></body></html>`;
  const versionFile = dist ? await readFile(path.join(dist, 'version.json'), 'utf8') : JSON.stringify({ commit: COMMIT });
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url, 'http://localhost');
      requests.push({ path: url.pathname, method: req.method, ref: url.searchParams.get('ref'), key: url.searchParams.get('key') });
      if (req.method === 'POST') {
        res.writeHead(hookStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'deploy-test' }));
      } else if (url.pathname === '/api/v1/health') {
        // Reproduce un arranque en frio antes de publicar el commit nuevo.
        const status = ++healthCalls === 1 ? 503 : 200;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'residuos-service', commit: COMMIT }));
      } else if (url.pathname === '/version.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(version === COMMIT ? versionFile : JSON.stringify({ commit: version }));
      } else if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(index);
      } else if (url.pathname.startsWith('/assets/') && !url.pathname.includes('..')) {
        res.writeHead(assetStatus, { 'Content-Type': 'application/javascript' });
        res.end(assetStatus === 200 ? dist ? await readFile(path.join(dist, url.pathname)) : 'console.log("app")' : '');
      } else {
        res.writeHead(404).end();
      }
    })().catch(() => { res.writeHead(500).end(); });
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const summary = path.join(temp, 'summary.md');
  const child = spawn(process.execPath, [path.join(__dirname, 'desplegar-render.cjs')], {
    timeout: 5000,
    env: {
      ...process.env, GITHUB_SHA: COMMIT, DEPLOY_API_URL: origin, DEPLOY_FRONTEND_URL: origin,
      RENDER_DEPLOY_HOOK_API: `${origin}/hook-api?key=secreto-api`,
      RENDER_DEPLOY_HOOK_FRONTEND: `${origin}/hook-web?key=secreto-web`,
      DEPLOY_TIMEOUT_MS: '1000', DEPLOY_INTERVAL_MS: '10', DEPLOY_REQUEST_TIMEOUT_MS: '500',
      GITHUB_STEP_SUMMARY: summary,
    },
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr, requests, summary: await readFile(summary, 'utf8') };
}

test('CLI por HTTP: dispara ambos hooks, espera el arranque y verifica HTML, version y bundle', async t => {
  const result = await ejecutar(t);
  assert.equal(result.code, 0, result.stderr);
  const posts = result.requests.filter(r => r.method === 'POST');
  assert.deepEqual(posts.map(r => [r.path, r.ref, r.key]), [
    ['/hook-api', COMMIT, 'secreto-api'], ['/hook-web', COMMIT, 'secreto-web'],
  ]);
  assert(result.requests.filter(r => r.path === '/api/v1/health').length >= 2);
  assert(result.requests.some(r => r.path.startsWith('/assets/')));
  assert.match(result.summary, /publicados y verificados/);
  assert(!result.stdout.includes('secreto'));
});

test('CLI devuelve exit 1 y resumen fallido si el frontend nunca publica el commit', async t => {
  const result = await ejecutar(t, { version: OLD });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Tiempo agotado/);
  assert.match(result.summary, /fallido/);
  assert.doesNotMatch(result.summary, /publicados y verificados/);
});

test('CLI falla aunque version y HTML sean nuevos si el bundle no esta publicado', async t => {
  const result = await ejecutar(t, { assetStatus: 404 });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HTTP 404/);
});

test('CLI falla inmediatamente ante un hook rechazado sin divulgar la clave', async t => {
  const result = await ejecutar(t, { hookStatus: 401 });
  assert.equal(result.code, 1);
  assert.equal(result.requests.length, 1);
  assert.match(result.stderr, /Render rechazo/);
  assert.doesNotMatch(result.stdout + result.stderr + result.summary, /secreto-api|secreto-web/);
});
