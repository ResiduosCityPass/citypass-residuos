import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OperatorSession from './OperatorSession.jsx';
import { login, clearSession } from './session.js';
import { api } from '../api/client.js';
import TopBar from '../components/shell/TopBar.jsx';
import LoginPage from '../pages/LoginPage.jsx';

vi.mock('../api/waste.js', () => ({ USING_MOCKS: false }));
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
let get;
let fetchMock;
const signIn = async () => { fetchMock.mockResolvedValueOnce(response({ access_token: 'session.jwt.value', refresh_token: 'refresh' })); await login('test-user', 'test-password'); };
const mount = (initialEntry = '/contingencias/clima') => render(<MemoryRouter initialEntries={[initialEntry]}><Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="*" element={<OperatorSession><p>Operación de residuos</p><TopBar title="Clima" openAlerts={0} /></OperatorSession>} />
</Routes></MemoryRouter>);
beforeEach(() => {
  vi.stubEnv('VITE_AUTH_MODE', 'federated'); vi.stubEnv('VITE_IDP_URL', 'https://idp.example'); vi.stubEnv('VITE_IDP_CLIENT_ID', 'confirmed');
  clearSession();
  get = vi.spyOn(api, 'get').mockResolvedValue({ sub: 'u', nombre: 'Operador Residuos', rol: 'OPERADOR' });
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => { clearSession(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Acceso del operador con Login', () => {
  it('pide login, vuelve a la pantalla solicitada y cierra la sesión desde la barra', async () => {
    const user = userEvent.setup(); mount();
    await user.type(await screen.findByLabelText(/^Usuario/), 'test-user');
    await user.type(screen.getByLabelText(/^Contraseña/), 'test-password');
    fetchMock.mockResolvedValueOnce(response({ access_token: 'session.jwt.value', refresh_token: 'refresh' }));
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Operación de residuos')).toBeInTheDocument();
    expect(screen.getByText('Operador Residuos')).toBeInTheDocument();
    expect(screen.getByText('Operador')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/auth/sesion');
    expect(screen.queryByRole('button', { name: 'Token' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
  it('explica que una cuenta autenticada puede no tener permisos de negocio', async () => {
    await signIn(); get.mockResolvedValue({ sub: 'delegado-res', nombre: 'Delegado', rol: null }); mount();
    expect(await screen.findByText('Sin permisos de operación')).toBeInTheDocument();
    expect(screen.queryByText('Operación de residuos')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByLabelText(/^Usuario/)).toBeInTheDocument();
  });
  it('permite reintentar una verificación que falló por falta de conexión', async () => {
    await signIn(); get.mockRejectedValueOnce(new Error('Sin conexión')); mount();
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Operación de residuos')).toBeInTheDocument();
  });
  it('permite volver al login después de una verificación rechazada', async () => {
    await signIn(); get.mockRejectedValueOnce(new Error('Sesión rechazada')); mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Volver a iniciar sesión' }));
    expect(await screen.findByLabelText(/^Usuario/)).toBeInTheDocument();
  });
  it('muestra un error de credenciales sin entrar a las páginas operativas', async () => {
    const user = userEvent.setup(); mount('/login');
    await user.type(screen.getByLabelText(/^Usuario/), 'test'); await user.type(screen.getByLabelText(/^Contraseña/), 'incorrecta');
    fetchMock.mockResolvedValueOnce(response({}, 401));
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText(/Usuario o contraseña incorrectos/)).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
  it('no sigue un destino externo después de iniciar sesión', async () => {
    const user = userEvent.setup(); mount({ pathname: '/login', state: { returnTo: '//otro-sitio.example' } });
    await user.type(screen.getByLabelText(/^Usuario/), 'test'); await user.type(screen.getByLabelText(/^Contraseña/), 'test');
    fetchMock.mockResolvedValueOnce(response({ access_token: 'jwt', refresh_token: 'refresh' }));
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.getByText('Operación de residuos')).toBeInTheDocument());
  });
  it('conserva el acceso local cuando no se habilita federación', () => {
    vi.stubEnv('VITE_AUTH_MODE', 'local'); mount('/login');
    expect(screen.getByText(/todavía no está habilitado/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Usuario/)).not.toBeInTheDocument();
  });
});
