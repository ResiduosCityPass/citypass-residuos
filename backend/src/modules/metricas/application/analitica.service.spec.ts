import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnaliticaService } from './analitica.service';

const URL_ANALITICA = 'https://analitica.test';
const BEARER = 'Bearer token.del.admin';
const HTML = '<!doctype html><html><body>Tablero</body></html>';

const respuesta = (status: number, cuerpo: string, contentType = 'text/html; charset=utf-8') =>
  new Response(cuerpo, { status, headers: { 'content-type': contentType } });

describe('AnaliticaService', () => {
  const fetchMock = jest.fn();
  const servicio = (env: Record<string, string> = { ANALITICA_URL: URL_ANALITICA }) =>
    new AnaliticaService(new ConfigService(env));

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('pide el tablero de Residuos con el mismo token del admin y devuelve el HTML', async () => {
    fetchMock.mockResolvedValue(respuesta(200, HTML));

    await expect(servicio().tablero(BEARER)).resolves.toEqual({ html: HTML });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${URL_ANALITICA}/embed/residuos`);
    expect(init.headers.Authorization).toBe(BEARER);
  });

  it('tolera la URL con barra al final', async () => {
    fetchMock.mockResolvedValue(respuesta(200, HTML));

    await servicio({ ANALITICA_URL: `${URL_ANALITICA}/` }).tablero(BEARER);

    expect(fetchMock.mock.calls[0][0]).toBe(`${URL_ANALITICA}/embed/residuos`);
  });

  it('acepta tambien el JSON con html', async () => {
    fetchMock.mockResolvedValue(respuesta(200, JSON.stringify({ html: HTML }), 'application/json'));

    await expect(servicio().tablero(BEARER)).resolves.toEqual({ html: HTML });
  });

  it('sin ANALITICA_URL avisa que no esta conectado y no llama a nadie', async () => {
    await expect(servicio({}).tablero(BEARER)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un rechazo de Analitica sale como 502 con su detalle, no como 401', async () => {
    fetchMock.mockResolvedValue(
      respuesta(401, JSON.stringify({ detail: 'Token inválido o expirado' }), 'application/json'),
    );

    const error = await servicio()
      .tablero(BEARER)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getResponse()).toEqual({
      code: 'ANALITICA_RECHAZO',
      message: 'Analítica respondió 401: Token inválido o expirado.',
    });
  });

  it('si Analitica no contesta, 502', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    await expect(servicio().tablero(BEARER)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('el JSON de prueba ({"status":"ok"}) no es un tablero', async () => {
    fetchMock.mockResolvedValue(respuesta(200, '{"status":"ok"}', 'application/json'));

    await expect(servicio().tablero(BEARER)).rejects.toMatchObject({
      response: { code: 'ANALITICA_SIN_TABLERO' },
    });
  });
});
