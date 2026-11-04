import { ApiDemo } from './demo-http';

export function urlDemo(valor: string): string {
  const url = new URL(valor);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Usá una URL HTTPS sin credenciales, query ni fragmento (HTTP solo en localhost).',
    );
  const normalizada = url.toString();
  let fin = normalizada.length;
  while (fin > 0 && normalizada[fin - 1] === '/') fin--;
  return normalizada.slice(0, fin);
}

export class ClienteDemoHttp implements ApiDemo {
  private readonly base: string;
  constructor(
    base: string,
    private readonly token: string,
    private readonly enviar = fetch,
  ) {
    this.base = urlDemo(base);
  }

  async request<T>(metodo: string, ruta: string, datos?: unknown, sensorKey?: string): Promise<T> {
    if (!ruta.startsWith('/') || ruta.startsWith('//') || ruta.includes('://'))
      throw new Error('La ruta debe pertenecer a la misma API.');
    let respuesta: Response;
    try {
      respuesta = await this.enviar(this.base + ruta, {
        method: metodo,
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
        headers: {
          'Content-Type': 'application/json',
          ...(sensorKey
            ? { 'X-Sensor-Key': sensorKey }
            : { Authorization: `Bearer ${this.token}` }),
        },
        ...(datos === undefined ? {} : { body: JSON.stringify(datos) }),
      });
    } catch {
      throw new Error(
        `No se completó ${metodo} ${ruta}. No reintentes una escritura sin revisar el registro.`,
      );
    }
    // No se imprime el body de error: puede contener valores enviados al endpoint.
    if (!respuesta.ok) throw new Error(`${metodo} ${ruta}: HTTP ${respuesta.status}`);
    return respuesta.status === 204 ? (undefined as T) : ((await respuesta.json()) as T);
  }
}
