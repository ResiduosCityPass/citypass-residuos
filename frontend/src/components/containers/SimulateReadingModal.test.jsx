import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimulateReadingModal from './SimulateReadingModal.jsx';
import { simulateContainerReading } from '../../api/waste.js';
import { ApiError } from '../../api/client.js';

vi.mock('../../api/waste.js', () => ({ simulateContainerReading: vi.fn() }));
const container = { id: 'ct-1', codigo: 'CT-0001', nivelLlenadoPct: 10, temperaturaC: 23, sensor: { codigo: 'SN-0001', bateriaPct: 81 } };
const mount = (value = container) => {
  const onDone = vi.fn(); const onClose = vi.fn();
  render(<SimulateReadingModal container={value} onDone={onDone} onClose={onClose} />);
  return { onDone, onClose };
};

describe('Simular lectura', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('explica los efectos reales y no envia nada al abrir o cancelar', async () => {
    const { onClose } = mount();
    expect(screen.getByText(/no confirma un vaciado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar y registrar lectura' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(simulateContainerReading).not.toHaveBeenCalled();
  });
  it('envia solo llenado y confirmacion tras aceptar; notifica el resultado', async () => {
    simulateContainerReading.mockResolvedValue({ estadoNuevo: 'CRITICO' });
    const { onDone, onClose } = mount();
    const field = screen.getByLabelText(/Nivel de llenado/);
    await userEvent.clear(field); await userEvent.type(field, '90.25');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar lectura' }));
    expect(simulateContainerReading).toHaveBeenCalledExactlyOnceWith('ct-1', { nivelLlenadoPct: 90.25, confirmar: true });
    expect(onDone).toHaveBeenCalledWith({ estadoNuevo: 'CRITICO' });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('cambiar el porcentaje invalida la confirmacion anterior', async () => {
    mount();
    await userEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/Nivel de llenado/), { target: { value: '90' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Confirmar y registrar lectura' })).toBeDisabled();
  });
  it.each(['', '-1', '101', '1.234'])('rechaza el nivel %s incluso con submit directo', async (value) => {
    mount();
    fireEvent.change(screen.getByLabelText(/Nivel de llenado/), { target: { value } });
    await userEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(document.getElementById('simulate-container-reading'));
    expect(simulateContainerReading).not.toHaveBeenCalled();
  });
  it.each(['0', '100'])('acepta el limite %s', async (value) => {
    simulateContainerReading.mockResolvedValue({ estadoNuevo: 'NORMAL' });
    mount();
    fireEvent.change(screen.getByLabelText(/Nivel de llenado/), { target: { value } });
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar lectura' }));
    expect(simulateContainerReading).toHaveBeenCalledWith('ct-1', { nivelLlenadoPct: Number(value), confirmar: true });
  });
  it.each([new Error('Sensor no disponible'), new ApiError({ code: 'HTTP_400', message: 'Sensor no disponible', status: 400 })])('conserva los datos ante error y permite corregir sin cerrar: %s', async (error) => {
    simulateContainerReading.mockRejectedValue(error);
    const { onDone, onClose } = mount({ ...container, temperaturaC: null, sensor: { ...container.sensor, bateriaPct: null } });
    expect(screen.getByText(/valor inicial, sin mediciones previas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar lectura' }));
    expect(await screen.findByText('Sensor no disponible')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nivel de llenado/)).toHaveValue(10);
    expect(onDone).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });
  it('bloquea duplicados y el cierre mientras registra', async () => {
    let resolve;
    simulateContainerReading.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { onClose } = mount();
    await userEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(document.getElementById('simulate-container-reading'));
    fireEvent.submit(document.getElementById('simulate-container-reading'));
    expect(simulateContainerReading).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}'); expect(onClose).not.toHaveBeenCalled();
    resolve({ estadoNuevo: 'NORMAL' });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
