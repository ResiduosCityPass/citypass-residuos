import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FleetPage from './FleetPage.jsx';
import { fetchTrucks, createTruck } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchTrucks: vi.fn(),
  createTruck: vi.fn(),
  updateTruck: vi.fn(),
}));

const truck = (extras = {}) => ({
  id: 'cm-1',
  patente: 'AB123CD',
  capacidadLitros: 12000,
  tipoResiduoHabilitado: 'COMUN',
  estado: 'DISPONIBLE',
  ...extras,
});

const rowFor = (plate) => screen.getByText(plate).closest('tr');

describe('CU-03 · flota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchTrucks.mockResolvedValue([truck()]);
  });

  it('lista patente, capacidad, residuo habilitado y estado', async () => {
    render(<FleetPage />);

    expect(await screen.findByText('AB123CD')).toBeInTheDocument();
    const row = within(rowFor('AB123CD'));
    expect(row.getByText('12.000 L')).toBeInTheDocument();
    expect(row.getByText('Comun')).toBeInTheDocument();
    expect(row.getByText('Disponible')).toBeInTheDocument();
  });

  /**
   * El contrato expone POST, GET y PATCH y nada mas. Un camion borrado seguiria
   * colgando de las rutas historicas que ejecuto; se lo saca de circulacion
   * poniendolo en MANTENIMIENTO.
   */
  it('no ofrece borrar camiones, porque el backend no lo permite', async () => {
    render(<FleetPage />);

    await screen.findByText('AB123CD');
    expect(within(rowFor('AB123CD')).queryByRole('button', { name: /Borrar|Baja|Eliminar/ })).not.toBeInTheDocument();
  });

  it('cuenta cuantos camiones estan disponibles para rutear', async () => {
    fetchTrucks.mockResolvedValue([
      truck(),
      truck({ id: 'cm-2', patente: 'AC456EF', estado: 'EN_RUTA' }),
      truck({ id: 'cm-3', patente: 'AD789GH', estado: 'MANTENIMIENTO' }),
    ]);
    render(<FleetPage />);

    expect(await screen.findByText(/Hoy hay 1 de 3 disponibles/)).toBeInTheDocument();
  });

  it('un camion en ruta no deja cambiarle el estado a mano', async () => {
    const user = userEvent.setup();
    fetchTrucks.mockResolvedValue([truck({ estado: 'EN_RUTA' })]);
    render(<FleetPage />);

    await screen.findByText('AB123CD');
    await user.click(within(rowFor('AB123CD')).getByRole('button', { name: 'Editar' }));

    // Primero hay que cerrar o cancelar su ruta: si no, quedaria una ruta viva
    // apuntando a un camion en mantenimiento.
    expect(screen.getByLabelText(/Estado/)).toBeDisabled();
  });

  it('en el alta no se elige el estado: todo camion nace disponible', async () => {
    const user = userEvent.setup();
    createTruck.mockResolvedValue(truck({ patente: 'ZZ999ZZ' }));
    render(<FleetPage />);

    await user.click(await screen.findByRole('button', { name: /Nuevo camion/ }));
    expect(screen.queryByLabelText(/Estado/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Patente/), 'ZZ999ZZ');
    await user.click(screen.getByRole('button', { name: 'Crear camion' }));

    await waitFor(() => expect(createTruck).toHaveBeenCalled());
    expect(createTruck.mock.calls[0][0]).not.toHaveProperty('estado');
  });

  it('la patente duplicada se muestra con su codigo de negocio', async () => {
    const user = userEvent.setup();
    createTruck.mockRejectedValue(
      new ApiError({ code: 'CAMION_PATENTE_DUPLICADA', status: 409, message: 'Ya existe un camion con la patente "AB123CD"' }),
    );
    render(<FleetPage />);

    await user.click(await screen.findByRole('button', { name: /Nuevo camion/ }));
    await user.type(screen.getByLabelText(/Patente/), 'AB123CD');
    await user.click(screen.getByRole('button', { name: 'Crear camion' }));

    expect(await screen.findByText('[CAMION_PATENTE_DUPLICADA]')).toBeInTheDocument();
  });
});
