import { ClienteDemoHttp, urlDemo } from './cliente-demo-http';

describe('Cliente de ensayo HTTP', () => {
  it.each([
    'http://example.com/api/v1',
    'https://user:secret@example.com',
    'https://example.com?token=secret',
    'https://example.com/#secreto',
    'file:///tmp/api',
  ])('rechaza un destino no seguro: %s', (url) => expect(() => urlDemo(url)).toThrow());

  it.each([
    'http://localhost:3038/api/v1/',
    'http://127.0.0.1:3038/api/v1/',
    'https://example.com/api/v1/',
  ])('acepta %s sin barras finales', (url) => expect(urlDemo(url)).toBe(url.slice(0, -1)));

  it('no envía el token humano al endpoint de lecturas de sensor', async () => {
    const enviar = jest.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    const api = new ClienteDemoHttp('https://example.com/api/v1', 'token-humano', enviar);
    await api.request('POST', '/lecturas', { nivelLlenadoPct: 90 }, 'clave-sensor');
    const options = enviar.mock.calls[0][1] as RequestInit;
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Sensor-Key': 'clave-sensor',
    });
    expect(options.redirect).toBe('error');
  });

  it('usa el token humano solo contra la API configurada y soporta 204', async () => {
    const enviar = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const api = new ClienteDemoHttp('https://example.com/api/v1', 'token-humano', enviar);
    await expect(api.request('PATCH', '/recurso', {})).resolves.toBeUndefined();
    expect(enviar.mock.calls[0][1].headers.Authorization).toBe('Bearer token-humano');
    await expect(api.request('GET', '//otro-host')).rejects.toThrow('misma API');
    await expect(api.request('GET', 'https://otro-host')).rejects.toThrow('misma API');
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('no imprime errores remotos que podrían contener secretos ni reintenta escrituras', async () => {
    const enviar = jest
      .fn()
      .mockResolvedValue(new Response('token-super-secreto', { status: 403 }));
    const api = new ClienteDemoHttp('https://example.com/api/v1', 'token-humano', enviar);
    await expect(api.request('POST', '/choferes')).rejects.toThrow('HTTP 403');
    expect(enviar).toHaveBeenCalledTimes(1);
    enviar.mockRejectedValue(new Error('token-super-secreto'));
    await expect(api.request('POST', '/choferes')).rejects.toThrow('No reintentes');
    expect(enviar).toHaveBeenCalledTimes(2);
  });
});
