/** La revision viene del proveedor que construye el artefacto, no del navegador. */
export function buildVersion(env = process.env) {
  const commit = env.RENDER_GIT_COMMIT || env.GITHUB_SHA || null;
  if (commit !== null && !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('El commit del build debe ser un SHA Git completo');
  }
  if (env.RENDER === 'true' && !commit) throw new Error('Render no informo el commit del build');
  return {
    name: 'citypass-build-version',
    apply: 'build',
    transformIndexHtml() {
      return commit ? [{ tag: 'meta', attrs: { name: 'citypass-build-commit', content: commit }, injectTo: 'head' }] : [];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ commit }) + '\n' });
    },
  };
}
