const { test } = require('node:test');
const assert = require('node:assert/strict');

test('la metadata y el HTML llevan el commit de Render aunque GITHUB_SHA sea distinto', async () => {
  const { buildVersion } = await import('../frontend/build-version.js');
  const commit = 'a'.repeat(40);
  const plugin = buildVersion({ RENDER_GIT_COMMIT: commit, GITHUB_SHA: 'b'.repeat(40) });
  const [meta] = plugin.transformIndexHtml();
  let artifact;
  plugin.generateBundle.call({ emitFile: value => { artifact = value; } });
  assert.equal(meta.attrs.content, commit);
  assert.equal(meta.attrs.name, 'citypass-build-commit');
  assert.equal(artifact.fileName, 'version.json');
  assert.equal(JSON.parse(artifact.source).commit, commit);
});

test('CI y Docker pueden marcar el build con GITHUB_SHA', async () => {
  const { buildVersion } = await import('../frontend/build-version.js');
  assert.equal(buildVersion({ GITHUB_SHA: 'c'.repeat(40) }).transformIndexHtml()[0].attrs.content, 'c'.repeat(40));
});

test('un build local sin proveedor informa null y no inventa un commit', async () => {
  const { buildVersion } = await import('../frontend/build-version.js');
  const plugin = buildVersion({});
  assert.deepEqual(plugin.transformIndexHtml(), []);
  plugin.generateBundle.call({ emitFile: value => assert.equal(JSON.parse(value.source).commit, null) });
});

test('Render sin revision y cualquier SHA invalido hacen fallar el build', async () => {
  const { buildVersion } = await import('../frontend/build-version.js');
  assert.throws(() => buildVersion({ RENDER: 'true' }), /Render no informo/);
  assert.throws(() => buildVersion({ RENDER_GIT_COMMIT: 'main' }), /SHA Git completo/);
});
