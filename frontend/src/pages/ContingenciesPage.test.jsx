import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ContingenciesPage from './ContingenciesPage.jsx';
import { fetchFloods, fetchZones, fetchRoutes, simulateFloodStart, simulateFloodEnd, enableFloodRecovery } from '../api/waste.js';

vi.mock('../api/waste.js', () => ({
  fetchFloods: vi.fn(), fetchZones: vi.fn(), fetchRoutes: vi.fn(),
  simulateFloodStart: vi.fn(), simulateFloodEnd: vi.fn(), enableFloodRecovery: vi.fn(),
}));

const flood = (estado = 'ACTIVA', extras = {}) => ({
  id: 'f-1', descripcion: 'Inundación Centro', estado,
  zonas: [{ zonaId: 'z1', zona: { nombre: 'Centro' } }],
  contenedores: [{ contenedorId: 'c1', contenedor: { codigo: 'CT-0001' }, vaciadoEn: null }],
  ...extras,
});
const mount = () => render(<MemoryRouter><ContingenciesPage /></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  fetchFloods.mockResolvedValue({ simuladorHabilitado: true, contingencias: [] });
  fetchZones.mockResolvedValue([{ id: 'z1', nombre: 'Centro' }, { id: 'z2', nombre: 'Norte', bloqueada: true }]);
  fetchRoutes.mockResolvedValue([]);
  simulateFloodStart.mockResolvedValue({}); simulateFloodEnd.mockResolvedValue({}); enableFloodRecovery.mockResolvedValue({});
});

describe('Inundaciones', () => {
  it('muestra el estado vacio y requiere descripcion y zonas para simular', async () => {
    mount();
    expect(await screen.findByText('No hay inundaciones registradas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simular inicio de inundación' })).toBeDisabled();
  });

  it('simula inicio con las zonas seleccionadas y limpia el formulario al completar', async () => {
    const user = userEvent.setup(); mount();
    await user.type(await screen.findByLabelText(/Descripción de la inundación/), 'Tormenta de prueba');
    await user.click(screen.getByRole('checkbox', { name: 'Centro' }));
    await user.click(screen.getByRole('button', { name: 'Simular inicio de inundación' }));
    await waitFor(() => expect(simulateFloodStart).toHaveBeenCalledWith({ descripcion: 'Tormenta de prueba', zonaIds: ['z1'] }));
    expect(await screen.findByText(/Inundación registrada/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Descripción de la inundación/)).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Centro' })).not.toBeChecked();
  });

  it('permite quitar una zona seleccionada antes de enviar', async () => {
    const user = userEvent.setup(); mount();
    const checkbox = await screen.findByRole('checkbox', { name: 'Centro' });
    await user.click(checkbox); await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(simulateFloodStart).not.toHaveBeenCalled();
  });

  it('oculta los controles de simulacion cuando el backend los deshabilita', async () => {
    fetchFloods.mockResolvedValue({ simuladorHabilitado: false, contingencias: [flood()] }); mount();
    await screen.findByRole('article', { name: 'Inundación Centro' });
    expect(screen.queryByRole('region', { name: 'Simulador de inundaciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simular finalización' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Habilitar recuperación' })).not.toBeInTheDocument();
  });

  it('la finalizacion se envia por separado de la habilitacion', async () => {
    fetchFloods.mockResolvedValue({ simuladorHabilitado: true, contingencias: [flood()] });
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: 'Simular finalización' }));
    await waitFor(() => expect(simulateFloodEnd).toHaveBeenCalledWith('f-1'));
    expect(enableFloodRecovery).not.toHaveBeenCalled();
    expect(await screen.findByText(/Falta habilitar la recuperación/)).toBeInTheDocument();
  });

  it('habilita la recuperacion luego de la finalizacion, aun sin simulador', async () => {
    fetchFloods.mockResolvedValue({ simuladorHabilitado: false, contingencias: [flood('PENDIENTE_RECUPERACION')] });
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: 'Habilitar recuperación' }));
    await waitFor(() => expect(enableFloodRecovery).toHaveBeenCalledWith('f-1'));
    expect(await screen.findByText(/Se conservan las demás restricciones/)).toBeInTheDocument();
  });

  it('muestra pendientes efectivos y rutas afectadas de esa contingencia', async () => {
    fetchFloods.mockResolvedValue({ simuladorHabilitado: true, contingencias: [flood('EN_RECUPERACION')] });
    fetchRoutes.mockResolvedValue([{ id: 'r1', contingenciaIds: ['f-1'], paradasSuspendidas: 1, camion: { patente: 'AB123CD' } }, { id: 'r2', contingenciaIds: ['otra'] }]);
    mount(); const article = within(await screen.findByRole('article', { name: 'Inundación Centro' }));
    expect(article.getByText('1 contenedor(es) pendientes de recuperación · 1 ruta(s) con paradas suspendidas')).toBeInTheDocument();
    expect(article.getByRole('link', { name: /AB123CD/ })).toHaveAttribute('href', '/rutas/r1');
    expect(article.getByRole('link', { name: 'Planificar recuperación' })).toHaveAttribute('href', '/rutas');
    expect(article.getByRole('link', { name: 'CT-0001' })).toHaveAttribute('href', '/contenedores/c1');
  });

  it('la recuperacion completada informa el vaciado sin ofrecer habilitar de nuevo', async () => {
    fetchFloods.mockResolvedValue({ simuladorHabilitado: true, contingencias: [flood('RECUPERADA', { contenedores: [{ contenedorId: 'c1', vaciadoEn: '2026-10-19T17:00:00Z' }] })] });
    mount(); await screen.findByText('Servicio recuperado');
    expect(screen.getByText('Vaciado confirmado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Habilitar recuperación' })).not.toBeInTheDocument();
  });

  it('muestra errores al cargar y permite reintentar', async () => {
    fetchFloods.mockRejectedValueOnce({ code: 'HTTP_500', message: 'No se pudo cargar' });
    const user = userEvent.setup(); mount(); await screen.findByText('[HTTP_500]');
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('No hay inundaciones registradas')).toBeInTheDocument();
  });

  it('si falla una accion conserva la contingencia y muestra el error', async () => {
    fetchFloods.mockResolvedValue({ simuladorHabilitado: true, contingencias: [flood()] });
    simulateFloodEnd.mockRejectedValue({ code: 'SIMULADOR_DESHABILITADO', message: 'El simulador esta deshabilitado' });
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: 'Simular finalización' }));
    expect(await screen.findByText('[SIMULADOR_DESHABILITADO]')).toBeInTheDocument();
    expect(screen.getByText('Inundación activa')).toBeInTheDocument();
  });

  it('explica si faltan zonas para el simulador', async () => {
    fetchZones.mockResolvedValue([]); mount();
    expect(await screen.findByText(/Creá al menos una zona/)).toBeInTheDocument();
  });
});
