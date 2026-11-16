import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MetricsPage, { LOAD_TIMEOUT_MS } from './MetricsPage.jsx';
import { SessionContext } from '../auth/SessionContext.js';
import { api } from '../api/client.js';
import * as analytics from '../api/analytics.js';

const ADMIN = { sub: 'qa-admin', rol: 'ADMINISTRADOR' };
const view = (n = 1) => ({ vistaId: `550e8400-e29b-41d4-a716-44665544000${n}`,
  url: `/api/v1/metricas/tableros/550e8400-e29b-41d4-a716-44665544000${n}` });
const element = (user = ADMIN) => <SessionContext.Provider value={user}><MetricsPage /></SessionContext.Provider>;
const frame = () => screen.getByTitle('Dashboard de métricas de Residuos');
const loaded = async () => { await screen.findByTitle('Dashboard de métricas de Residuos'); fireEvent.load(frame()); return frame(); };
let get, prepare, release;
beforeEach(() => {
  let next = 0;
  get = vi.spyOn(api, 'get').mockResolvedValue(ADMIN);
  prepare = vi.spyOn(analytics, 'prepareAnalyticsView').mockImplementation(async () => view(++next));
  release = vi.spyOn(analytics, 'releaseAnalyticsView').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Tablero con proxy autenticado y cabeceras de Analitica', () => {
  it('usa una ruta propia en src, sin srcdoc ni token en la URL, y espera la carga', async () => {
    const local = vi.spyOn(localStorage, 'setItem'); const session = vi.spyOn(sessionStorage, 'setItem');
    render(element()); expect(screen.getByText('Cargando el tablero…')).toBeInTheDocument();
    await loaded();
    expect(frame()).toHaveAttribute('src', view().url);
    expect(frame()).not.toHaveAttribute('srcdoc');
    expect(frame()).toHaveAttribute('sandbox', 'allow-scripts');
    expect(frame()).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(prepare).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), verificar: false });
    expect(local).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /otra pestaña/ })).not.toBeInTheDocument();
    expect(screen.getByText(/una vez por día/)).toBeInTheDocument();
    expect(screen.queryByText('Cargando el tablero…')).not.toBeInTheDocument();
  });
  it('permite al operador ver el tablero', async () => {
    render(element({ sub: 'delegado', rol: 'OPERADOR' })); expect(await loaded()).toBeInTheDocument();
  });
  it.each(['CHOFER', null, 'otro'])('no pide la sesion del iframe para rol %s', async (rol) => {
    render(element({ sub: 'sin-permiso', rol })); await screen.findByText('Sin acceso al tablero');
    expect(prepare).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  it('en desarrollo consulta primero el rol verificado de la API', async () => {
    render(element(null)); await loaded();
    expect(get).toHaveBeenCalledWith('/auth/sesion', undefined, expect.any(Object));
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('no pide el iframe si la cuenta local no tiene permisos', async () => {
    get.mockResolvedValue({ sub: 'u', rol: null }); render(element(null));
    await screen.findByText('Sin acceso al tablero'); expect(prepare).not.toHaveBeenCalled();
  });
  it('sin conexion configurada informa que falta habilitar el tablero', async () => {
    prepare.mockRejectedValueOnce({ code: 'ANALITICA_NO_CONFIGURADA', status: 503 }); render(element());
    await screen.findByText('El tablero todavía no está conectado');
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });
  it.each([400, 401, 404, 503, 0])('permite reintentar un fallo HTTP %i al preparar', async (status) => {
    prepare.mockRejectedValueOnce({ status }); render(element());
    expect(await screen.findByRole('alert')).toHaveTextContent('Analítica no disponible');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(await loaded()).toBeInTheDocument();
  });
  it('no muestra el iframe cuando la preparacion devuelve 403', async () => {
    prepare.mockRejectedValueOnce({ status: 403 }); render(element());
    await screen.findByText('Sin acceso al tablero');
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });
  it('cancela el pedido vencido y libera una cookie cuya respuesta llega tarde', async () => {
    vi.useFakeTimers(); let resolve;
    prepare.mockImplementationOnce(() => new Promise(r => { resolve = r; })); render(element());
    await act(async () => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS); });
    expect(screen.getByRole('alert')).toHaveTextContent('Analítica no disponible');
    expect(prepare.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => { resolve(view()); });
    expect(release).toHaveBeenCalledWith(view());
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });
  it('si el iframe no termina, vence el plazo y se limpia su cookie', async () => {
    vi.useFakeTimers(); render(element()); await act(async () => {});
    expect(frame()).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS); });
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(release).toHaveBeenCalledWith(view());
  });
  it('actualizar desmonta la vista anterior y crea otra con su cookie propia', async () => {
    render(element()); const old = await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar tablero' }));
    await loaded(); expect(frame()).not.toBe(old); expect(frame()).toHaveAttribute('src', view(2).url);
    expect(release).toHaveBeenCalledWith(view());
  });
  it('cambiar de cuenta y desmontar libera la vista, aun con una respuesta pendiente', async () => {
    let resolve; prepare.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const { rerender, unmount } = render(element());
    rerender(element({ sub: 'chofer', rol: 'CHOFER' })); await screen.findByText('Sin acceso al tablero');
    await act(async () => { resolve(view()); });
    expect(release).toHaveBeenCalledWith(view()); expect(prepare).toHaveBeenCalledTimes(1);
    unmount(); expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });
  it('desmontar limpia la cookie sin esperar que siga vigente el token', async () => {
    const { unmount } = render(element()); await loaded(); unmount();
    expect(release).toHaveBeenCalledWith(view());
  });
  it('un 401 del iframe pide verificar con refresh una vez y no permite un bucle', async () => {
    render(element()); await loaded(); const old = frame().contentWindow;
    const send = (source) => act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'null', source, data: { tipo: 'citypass-analitica-error', estado: 401 },
    })));
    send(old); await act(async () => {});
    expect(prepare).toHaveBeenLastCalledWith({ signal: expect.any(AbortSignal), verificar: true });
    expect(frame()).toHaveAttribute('src', view(2).url); fireEvent.load(frame());
    send(old); expect(prepare).toHaveBeenCalledTimes(2);
    send(frame().contentWindow); expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it('explica el 403 recibido desde el iframe y descarta su documento', async () => {
    render(element()); await loaded();
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: frame().contentWindow,
      data: { tipo: 'citypass-analitica-error', estado: 403 } })));
    expect(screen.getByText('Sin acceso al tablero')).toBeInTheDocument(); expect(release).toHaveBeenCalledWith(view());
  });
  it('si la verificacion del 401 falla, muestra el error y no repite el intento', async () => {
    render(element()); await loaded(); prepare.mockRejectedValueOnce({ status: 503 });
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: frame().contentWindow,
      data: { tipo: 'citypass-analitica-error', estado: 401 } })));
    expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(prepare).toHaveBeenCalledTimes(2);
  });
  it('valida ventana, origen y alturas finitas antes de ajustar el iframe', async () => {
    render(element()); await loaded();
    const send = (data, source = frame().contentWindow, origin = 'null') => act(() => window.dispatchEvent(new MessageEvent('message', { origin, source, data })));
    send({ tipo: 'citypass-tablero-altura', altura: 750 }, window);
    send({ tipo: 'citypass-tablero-altura', altura: 750 }, frame().contentWindow, 'https://otro.example');
    send({ tipo: 'otra', altura: 750 });
    for (const altura of [NaN, Infinity, -1, 0, '750']) send({ tipo: 'citypass-tablero-altura', altura });
    expect(frame()).toHaveStyle({ height: '1200px' });
    send({ tipo: 'citypass-tablero-altura', altura: 750.3 }); expect(frame()).toHaveStyle({ height: '751px' });
    send({ tipo: 'citypass-tablero-altura', altura: 10 }); expect(frame()).toHaveStyle({ height: '320px' });
    send({ tipo: 'citypass-tablero-altura', altura: 100000 }); expect(frame()).toHaveStyle({ height: '10000px' });
  });
});
