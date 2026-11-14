import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MetricsPage, { LOAD_TIMEOUT_MS } from './MetricsPage.jsx';
import { SessionContext } from '../auth/SessionContext.js';
import { api } from '../api/client.js';

const ADMIN = { sub: 'qa-admin', rol: 'ADMINISTRADOR' };
const HTML = '<!doctype html><html><body>Cuadrillas afectadas por clima — DATOS-PRIVADOS</body></html>';
const frame = () => screen.getByTitle('Dashboard de métricas de Residuos');
const view = (user = ADMIN) => <SessionContext.Provider value={user}><MetricsPage /></SessionContext.Provider>;
let get;
beforeEach(() => { get = vi.spyOn(api, 'get').mockResolvedValue({ html: HTML }); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Tablero autenticado de Analitica', () => {
  it('pide el HTML a la API y lo embebe aislado, sin src ni enlaces que pierdan la autorizacion', async () => {
    const local = vi.spyOn(localStorage, 'setItem');
    const session = vi.spyOn(sessionStorage, 'setItem');
    render(view());
    expect(screen.getByText('Cargando el tablero…')).toBeInTheDocument();
    await screen.findByTitle('Dashboard de métricas de Residuos');
    expect(get).toHaveBeenCalledWith('/metricas/tablero', undefined, expect.objectContaining({ cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) }));
    expect(frame()).toHaveAttribute('srcdoc', HTML);
    expect(frame()).not.toHaveAttribute('src');
    expect(frame()).toHaveAttribute('sandbox', 'allow-scripts');
    expect(frame()).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.queryByRole('link', { name: /otra pestaña/ })).not.toBeInTheDocument();
    expect(local).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
    expect(screen.getByText(/una vez por día/)).toBeInTheDocument();
  });
  it('permite al operador ver el tablero', async () => {
    render(view({ sub: 'delegado', rol: 'OPERADOR' }));
    expect(await screen.findByTitle('Dashboard de métricas de Residuos')).toBeInTheDocument();
  });
  it.each(['CHOFER', null, 'otro'])('no consulta Analitica para rol %s', async (rol) => {
    render(view({ sub: 'sin-permiso', rol }));
    expect(await screen.findByText('Sin acceso al tablero')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });
  it('en desarrollo consulta el rol verificado antes de pedir el tablero', async () => {
    get.mockResolvedValueOnce(ADMIN).mockResolvedValueOnce({ html: HTML });
    render(view(null));
    await screen.findByTitle('Dashboard de métricas de Residuos');
    expect(get.mock.calls.map(([path]) => path)).toEqual(['/auth/sesion', '/metricas/tablero']);
  });
  it('no consulta el proveedor si la verificacion del rol local resulta sin permisos', async () => {
    get.mockResolvedValueOnce({ sub: 'u', rol: null }); render(view(null));
    await screen.findByText('Sin acceso al tablero');
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('sin direccion habilitada avisa que falta conectarlo', async () => {
    get.mockRejectedValueOnce({ code: 'ANALITICA_NO_CONFIGURADA', status: 503 }); render(view());
    expect(await screen.findByText('El tablero todavía no está conectado')).toBeInTheDocument();
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });
  it.each([400, 401, 503, 0])('muestra un error recuperable para HTTP %i', async (status) => {
    get.mockRejectedValueOnce({ status }); render(view());
    expect(await screen.findByRole('alert')).toHaveTextContent('Analítica no disponible');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTitle('Dashboard de métricas de Residuos')).toBeInTheDocument();
  });
  it('explica la falta de acceso cuando Analitica responde 403', async () => {
    get.mockRejectedValueOnce({ status: 403 }); render(view());
    expect(await screen.findByText('Sin acceso al tablero')).toBeInTheDocument();
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });
  it('descarta un HTML vacio', async () => {
    get.mockResolvedValueOnce({ html: '  ' }); render(view());
    expect(await screen.findByRole('alert')).toHaveTextContent('Analítica no disponible');
  });
  it('cancela un pedido que no termina y no acepta su respuesta tardia', async () => {
    vi.useFakeTimers(); let resolve;
    get.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    render(view());
    await act(async () => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS); });
    expect(screen.getByRole('alert')).toHaveTextContent('Analítica no disponible');
    expect(get.mock.calls[0][2].signal.aborted).toBe(true);
    await act(async () => { resolve({ html: HTML }); });
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });
  it('actualizar quita el HTML anterior hasta completar el pedido nuevo', async () => {
    render(view()); await screen.findByTitle('Dashboard de métricas de Residuos');
    let resolve;
    get.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar tablero' }));
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
    await act(async () => { resolve({ html: '<html>Otro tablero autorizado</html>' }); });
    expect(frame()).toHaveAttribute('srcdoc', '<html>Otro tablero autorizado</html>');
  });
  it('cambiar de cuenta quita el HTML y no acepta una respuesta de la cuenta anterior', async () => {
    let resolve;
    get.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const { rerender } = render(view());
    rerender(view({ sub: 'chofer', rol: 'CHOFER' }));
    await screen.findByText('Sin acceso al tablero');
    await act(async () => { resolve({ html: HTML }); });
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('desmontar cancela el pedido y quita los datos privados', async () => {
    const { unmount, container } = render(view());
    await screen.findByTitle('Dashboard de métricas de Residuos');
    const signal = get.mock.calls[0][2].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(container.innerHTML).not.toContain('DATOS-PRIVADOS');
  });
  it('solo toma alturas finitas de su propio iframe y limita el tamaño', async () => {
    render(view()); await screen.findByTitle('Dashboard de métricas de Residuos');
    const send = (data, source = frame().contentWindow, origin = 'null') => act(() => window.dispatchEvent(new MessageEvent('message', { source, data, origin })));
    send({ tipo: 'citypass-tablero-altura', altura: 750 }, frame().contentWindow, 'https://otro.example');
    send({ tipo: 'citypass-tablero-altura', altura: 750 }, window);
    send({ tipo: 'otra', altura: 750 });
    for (const altura of [NaN, Infinity, -1, 0, '750']) send({ tipo: 'citypass-tablero-altura', altura });
    expect(frame()).toHaveStyle({ height: '1200px' });
    send({ tipo: 'citypass-tablero-altura', altura: 750.3 });
    expect(frame()).toHaveStyle({ height: '751px' });
    send({ tipo: 'citypass-tablero-altura', altura: 10 });
    expect(frame()).toHaveStyle({ height: '320px' });
    send({ tipo: 'citypass-tablero-altura', altura: 100000 });
    expect(frame()).toHaveStyle({ height: '10000px' });
  });
  it('un mensaje sin iframe montado no cambia el estado', async () => {
    get.mockRejectedValueOnce({ status: 503 }); render(view());
    await screen.findByRole('alert');
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'null', data: { tipo: 'citypass-tablero-altura', altura: 400 } })));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
