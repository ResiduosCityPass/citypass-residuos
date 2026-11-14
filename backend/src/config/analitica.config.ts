/** URL fija del proveedor: nunca se toma un destino ni un tablero de la request. */
export function urlTableroAnalitica(value: string | undefined, entorno: string): URL | null {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('ANALITICA_URL debe ser una URL valida');
  }
  const local =
    entorno !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'ANALITICA_URL requiere HTTPS sin credenciales ni query (HTTP solo en localhost)',
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/embed`;
  url.searchParams.set('dashboard', 'residuos');
  return url;
}
