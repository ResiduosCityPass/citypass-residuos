import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessToken, login, logout, clearSession, startSessionRefresh, readSession, renewAccessToken, subscribeSession } from './session.js';
import { api, apiPublic, clearToken, readDriverToken, readToken, saveToken, seedDevToken } from '../api/client.js';

const pair = { access_token: 'idp.access.token', refresh_token: 'rotating-secret' };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let fetchMock;
beforeEach(() => {
  vi.stubEnv('VITE_AUTH_MODE', 'federated');
  vi.stubEnv('VITE_IDP_URL', 'https://idp.example');
  vi.stubEnv('VITE_IDP_CLIENT_ID', 'confirmed-residuos-client');
  clearSession(); clearToken();
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => { clearSession(); clearToken(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const signIn = async () => { fetchMock.mockResolvedValueOnce(response(pair)); await login(' delegado-res ', 'test-only-password'); };

describe('sesion federada', () => {
  it('usa el cliente configurado y guarda solamente la sesion en la pestaña', async () => {
    await signIn();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://idp.example/auth/login');
    expect(JSON.parse(init.body)).toEqual({ username: 'delegado-res', password: 'test-only-password', clientId: 'confirmed-residuos-client' });
    expect(readSession()).toMatchObject(pair);
    expect(sessionStorage.getItem('citypass.federated-session')).not.toContain('password');
    expect(localStorage.getItem('citypass.federated-session')).toBeNull();
    expect(accessToken()).toBe(pair.access_token);
  });
  it('no inventa el client_id ni envía contraseñas por HTTP', async () => {
    vi.stubEnv('VITE_IDP_CLIENT_ID', '');
    await expect(login('u', 'p')).rejects.toThrow('Falta configurar');
    vi.stubEnv('VITE_IDP_CLIENT_ID', 'confirmed'); vi.stubEnv('VITE_IDP_URL', 'http://idp.example');
    await expect(login('u', 'p')).rejects.toThrow('HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('maneja credenciales incorrectas, indisponibilidad y respuestas incompletas', async () => {
    fetchMock.mockResolvedValueOnce(response({}, 401));
    await expect(login('u', 'p')).rejects.toThrow('incorrectos');
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(login('u', 'p')).rejects.toThrow('contactar');
    fetchMock.mockResolvedValueOnce(response({ access_token: 'partial' }));
    await expect(login('u', 'p')).rejects.toThrow('incompleta');
    expect(readSession()).toBeNull();
  });
  it('un solo refresh atiende a todos los requests vencidos y rota ambos tokens', async () => {
    await signIn();
    const next = { access_token: 'new.access.token', refresh_token: 'new-refresh' };
    fetchMock.mockResolvedValueOnce(response(next));
    expect(await Promise.all([renewAccessToken(pair.access_token), renewAccessToken(pair.access_token)])).toEqual([next.access_token, next.access_token]);
    expect(readSession()).toMatchObject(next);
    // Un 401 tardío del token anterior reutiliza el nuevo sin otro refresh.
    await renewAccessToken(pair.access_token);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('una respuesta de refresh tardía no deshace un logout', async () => {
    await signIn();
    let resolve;
    fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const refreshing = renewAccessToken(pair.access_token);
    clearSession(); resolve(response({ access_token: 'late.token', refresh_token: 'late-refresh' }));
    expect(await refreshing).toBe('');
    expect(readSession()).toBeNull();
  });
  it('refresh revocado cierra la sesión; un corte de red permite reintentar', async () => {
    await signIn();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(renewAccessToken(pair.access_token)).rejects.toThrow('contactar');
    expect(accessToken()).toBe(pair.access_token);
    fetchMock.mockResolvedValueOnce(response({}, 401));
    await expect(renewAccessToken(pair.access_token)).rejects.toThrow();
    expect(readSession()).toBeNull();
  });
  it('notifica cambios y permite cancelar una suscripción', async () => {
    const changed = vi.fn(); const stop = subscribeSession(changed);
    await signIn(); stop(); clearSession();
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it('renueva a los 13 minutos con refreshToken camelCase y conserva la nueva vigencia', async () => {
    vi.useFakeTimers(); await signIn();
    const stop = startSessionRefresh();
    fetchMock.mockResolvedValueOnce(response({ access_token: 'renewed', refresh_token: 'rotated', expires_in: 900 }));
    await vi.advanceTimersByTimeAsync(779999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refreshToken: pair.refresh_token });
    expect(readSession()).toMatchObject({ access_token: 'renewed', refresh_token: 'rotated' });
    stop();
    await vi.advanceTimersByTimeAsync(900000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('reintenta la renovacion preventiva tras un corte de red', async () => {
    vi.useFakeTimers(); await signIn();
    const stop = startSessionRefresh();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(780000);
    expect(accessToken()).toBe(pair.access_token);
    fetchMock.mockResolvedValueOnce(response({ access_token: 'retry-token', refresh_token: 'retry-refresh' }));
    await vi.advanceTimersByTimeAsync(30000);
    expect(accessToken()).toBe('retry-token'); stop();
  });
  it('logout borra ambos tokens inmediatamente y revoca el refresh del IdP', async () => {
    await signIn(); fetchMock.mockResolvedValueOnce(response(null, 204));
    const result = logout();
    expect(readSession()).toBeNull();
    await result;
    expect(fetchMock.mock.calls[1][0]).toBe('https://idp.example/auth/logout');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refreshToken: pair.refresh_token });
  });
});

describe('API con login federado', () => {
  it('reintenta una vez un 401 con el nuevo token', async () => {
    await signIn();
    fetchMock.mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ access_token: 'new.token.value', refresh_token: 'new-refresh' }))
      .mockResolvedValueOnce(response([{ id: 'alert' }]));
    expect(await api.get('/alertas')).toEqual([{ id: 'alert' }]);
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer new.token.value');
  });
  it('un segundo 401 cierra la sesión sin seguir reintentando', async () => {
    await signIn();
    fetchMock.mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ access_token: 'new.token.value', refresh_token: 'new-refresh' }))
      .mockResolvedValueOnce(response({ message: 'Rechazado' }, 401));
    await expect(api.get('/alertas')).rejects.toMatchObject({ status: 401 });
    expect(readSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('no refresca un 403 ni las solicitudes públicas', async () => {
    await signIn();
    fetchMock.mockResolvedValueOnce(response({ message: 'Sin rol' }, 403));
    await expect(api.get('/alertas')).rejects.toMatchObject({ status: 403 });
    fetchMock.mockResolvedValueOnce(response([]));
    await apiPublic.get('/publico/contenedores/cercanos');
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('mantiene separadas la credencial del chofer y la sesión humana', async () => {
    await signIn(); saveToken('local.driver.credential');
    vi.stubEnv('VITE_DEV_TOKEN', 'fake.admin.token');
    expect(seedDevToken('/mapa')).toBe(false);
    expect(readToken()).toBe(pair.access_token);
    expect(readDriverToken()).toBe('local.driver.credential');
    fetchMock.mockResolvedValueOnce(response(null));
    await api.get('/rutas/mias');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer local.driver.credential');
    expect(readSession()).toMatchObject(pair);
  });
});
