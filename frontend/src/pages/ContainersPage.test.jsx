import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ContainersPage from './ContainersPage.jsx';
import {
  fetchContainers,
  fetchZones,
  createContainer,
  deleteContainer,
} from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchContainers: vi.fn(),
  fetchZones: vi.fn(),
  createContainer: vi.fn(),
  updateContainer: vi.fn(),
  deleteContainer: vi.fn(),
  linkSensor: vi.fn(),
}));

const ZONE = { id: 'zn-1', nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60, bloqueada: false };

const container = (extras = {}) => ({
  id: 'ct-1',
  codigo: 'CT-0001',
  zonaId: 'zn-1',
  tipoResiduo: 'COMUN',
  capacidadLitros: 1100,
  lat: -34.6,
  lng: -58.38,
  estado: 'CRITICO',
  nivelLlenadoPct: 94.14,
  temperaturaC: 20.6,
  ultimaLecturaEn: new Date().toISOString(),
  activo: true,
  ...extras,
});

const mount = () => render(<MemoryRouter><ContainersPage /></MemoryRouter>);

describe('ABM de contenedores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchZones.mockResolvedValue([ZONE]);
    fetchContainers.mockResolvedValue([container()]);
  });

  it('lista los contenedores con su estado y su nivel', async () => {
    mount();

    // Acotado a la fila: "Critico" tambien es una opcion del <select> de estado.
    const row = (await screen.findByText('CT-0001')).closest('tr');
    expect(within(row).getByText('Critico')).toBeInTheDocument();
    expect(within(row).getByText('94.14%')).toBeInTheDocument();
  });

  /**
   * Un contenedor sin sensor se queda en NORMAL con nivel 0 y ultimaLecturaEn
   * null para siempre. No es un contenedor vacio: es uno que no reporta, y su
   * verde al 0% miente si no se lo distingue.
   */
  it('distingue el que nunca reporto del que reporta y esta vacio', async () => {
    fetchContainers.mockResolvedValue([
      container({ id: 'ct-6', codigo: 'CT-0006', estado: 'NORMAL', nivelLlenadoPct: 0, ultimaLecturaEn: null }),
    ]);
    mount();

    expect(await screen.findByText('nunca reportó')).toBeInTheDocument();
  });

  it('no deja crear contenedores si todavia no hay ninguna zona', async () => {
    fetchZones.mockResolvedValue([]);
    fetchContainers.mockResolvedValue([]);
    mount();

    const create = await screen.findByRole('button', { name: /Nuevo contenedor/ });
    // Todo contenedor pertenece a una zona: sin zonas el formulario no tiene
    // nada que ofrecer en el <select> y el alta falla con ZONA_NO_ENCONTRADA.
    await waitFor(() => expect(create).toBeDisabled());
  });

  it('el codigo es opcional en el alta y no se manda si quedo vacio', async () => {
    const user = userEvent.setup();
    createContainer.mockResolvedValue(container({ codigo: 'CT-0002' }));
    mount();

    await user.click(await screen.findByRole('button', { name: /Nuevo contenedor/ }));
    await user.type(screen.getByLabelText(/Latitud/), '-34.6037');
    await user.type(screen.getByLabelText(/Longitud/), '-58.3816');
    await user.click(screen.getByRole('button', { name: 'Crear contenedor' }));

    await waitFor(() => expect(createContainer).toHaveBeenCalled());
    expect(createContainer.mock.calls[0][0]).not.toHaveProperty('codigo');
  });

  it('desarma el 400 y pone cada mensaje debajo de su campo', async () => {
    const user = userEvent.setup();
    const details = ['lat must be a latitude string or number'];
    createContainer.mockRejectedValue(
      new ApiError({ code: 'HTTP_400', status: 400, message: details.join('. '), details }),
    );
    mount();

    await user.click(await screen.findByRole('button', { name: /Nuevo contenedor/ }));
    await user.click(screen.getByRole('button', { name: 'Crear contenedor' }));

    expect(await screen.findByText('must be a latitude string or number')).toBeInTheDocument();
  });

  it('la baja avisa que es logica y que el historico se conserva', async () => {
    const user = userEvent.setup();
    deleteContainer.mockResolvedValue(null);
    mount();

    const row = (await screen.findByText('CT-0001')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Baja' }));

    expect(await screen.findByText(/baja lógica/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dar de baja' }));

    await waitFor(() => expect(deleteContainer).toHaveBeenCalledWith('ct-1'));
  });

  it('en la edicion el codigo queda bloqueado porque el backend no lo acepta', async () => {
    const user = userEvent.setup();
    mount();

    const row = (await screen.findByText('CT-0001')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText('Codigo')).toBeDisabled();
  });
});
