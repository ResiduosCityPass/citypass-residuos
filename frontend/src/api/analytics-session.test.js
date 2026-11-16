import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiSameOrigin } from './client.js';
import { clearSession, login, accessToken } from '../auth/session.js';

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const first = { access_token: 'first.human.token', refresh_token: 'refresh-1' };
const fresh = { access_token: 'fresh.human.token', refresh_token: 'refresh-2' };
let fetchMock;
beforeEach(async () => {
  vi.stubEnv('VITE_AUTH_MODE', 'federated');
  vi.stubEnv('VITE_IDP_URL', 'https://idp.example');
  vi.stubEnv('VITE_IDP_CLIENT_ID', 'citypass-residuos-web');
  clearSession();
  fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(first));
  await login('usuario-prueba', 'clave-prueba');
});
afterEach(() => { clearSession(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Sesión del tablero: cliente HTTP compartido con Login', () => {
  it('renueva una sola vez ante 401 y pide de nuevo con el token nuevo y sin cache', async () => {
    fetchMock.mockResolvedValueOnce(reply({ code: 'ANALITICA_SESION_VENCIDA' }, 401))
      .mockResolvedValueOnce(reply(fresh))
      .mockResolvedValueOnce(reply({ vistaId: 'vista', url: '/api/v1/metricas/tableros/vista' }));
    const signal = new AbortController().signal;
    expect(await apiSameOrigin.post('/metricas/tableros', { verificar: true }, { cache: 'no-store', redirect: 'error', signal }))
      .toEqual({ vistaId: 'vista', url: '/api/v1/metricas/tableros/vista' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toBe('https://idp.example/auth/refresh');
    expect(fetchMock.mock.calls[2][1].body).toBe(JSON.stringify({ refreshToken: 'refresh-1' }));
    for (const i of [1, 3]) {
      const [url, options] = fetchMock.mock.calls[i];
      expect(url).toBe('/api/v1/metricas/tableros');
      expect(url).not.toContain('token');
      expect(options).toMatchObject({ cache: 'no-store', redirect: 'error', signal });
    }
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer first.human.token');
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer fresh.human.token');
    expect(sessionStorage.getItem('citypass.federated-session')).not.toContain('DATOS-DEL-TABLERO');
  });
  it('un segundo 401 invalida la sesion en vez de entrar en un bucle de refresh', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 401)).mockResolvedValueOnce(reply(fresh))
      .mockResolvedValueOnce(reply({ code: 'ANALITICA_SESION_VENCIDA' }, 401));
    await expect(apiSameOrigin.post('/metricas/tableros', { verificar: true })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(accessToken()).toBe('');
  });
  it.each([400, 403, 503])('no renueva ni reintenta ante HTTP %s', async (status) => {
    fetchMock.mockResolvedValueOnce(reply({ code: 'ANALITICA_NO_DISPONIBLE' }, status));
    await expect(apiSameOrigin.post('/metricas/tableros', {})).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(accessToken()).toBe(first.access_token);
  });
});
