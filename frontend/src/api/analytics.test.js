import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { apiSameOrigin } from './client.js';
import { prepareAnalyticsView, releaseAnalyticsView } from './analytics.js';
const view = { vistaId: '550e8400-e29b-41d4-a716-446655440001',
  url: '/api/v1/metricas/tableros/550e8400-e29b-41d4-a716-446655440001' };
let post, fetchMock;
beforeEach(() => {
  post = vi.spyOn(apiSameOrigin, 'post').mockResolvedValue(view);
  fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 204 });
});
afterEach(() => vi.restoreAllMocks());
describe('Preparacion y limpieza de la vista de Analitica', () => {
  it('crea una vista propia con la sesion humana del cliente compartido', async () => {
    expect(await prepareAnalyticsView()).toEqual(view);
    expect(post).toHaveBeenCalledWith('/metricas/tableros', { verificar: false }, expect.objectContaining({
      credentials: 'same-origin', cache: 'no-store', redirect: 'error' }));
  });
  it('mantiene el AbortSignal y la verificacion cuando hay que renovar', async () => {
    const signal = new AbortController().signal;
    await prepareAnalyticsView({ signal, verificar: true });
    expect(post).toHaveBeenCalledWith('/metricas/tableros', { verificar: true }, expect.objectContaining({ signal }));
  });
  it.each([null, {}, { vistaId: 23 }, { vistaId: '../otro', url: '/otro' },
    { ...view, url: 'https://otro.example/token' }, { ...view, url: view.url + '?token=privado' }])
  ('no usa destinos ni ids inesperados: %j', async (value) => {
    post.mockResolvedValue(value); await expect(prepareAnalyticsView()).rejects.toThrow('vista válida');
    releaseAnalyticsView(value); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('elimina solo la cookie del path de su vista y no manda tokens', () => {
    releaseAnalyticsView(view);
    expect(fetchMock).toHaveBeenCalledWith(view.url, { method: 'DELETE', credentials: 'same-origin',
      cache: 'no-store', redirect: 'error', keepalive: true });
  });
  it('un fallo al limpiar no impide salir de la pantalla', async () => {
    fetchMock.mockRejectedValue(new Error('Sin red')); releaseAnalyticsView(view); await Promise.resolve();
  });
});
