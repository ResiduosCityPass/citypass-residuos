import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZonesPage from './ZonesPage.jsx';
import { fetchZones, fetchContainers, createZone, setZoneBlocked, deleteZone } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchZones: vi.fn(),
  fetchContainers: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  setZoneBlocked: vi.fn(),
  deleteZone: vi.fn(),
}));

const zone = (extras = {}) => ({
  id: 'zn-1',
  nombre: 'Centro',
  umbralCriticoPct: 70,
  umbralTemperaturaC: 60,
  bloqueada: false,
  ...extras,
});

const rowFor = (name) => screen.getByText(name).closest('tr');

describe('CU-02 zonas y umbrales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchZones.mockResolvedValue([zone()]);
    fetchContainers.mockResolvedValue([]);
  });

  it('muestra los dos umbrales de cada zona', async () => {
    render(<ZonesPage />);

    const row = within(rowFor(await screen.findByText('Centro').then(() => 'Centro')));
    expect(row.getByText('70%')).toBeInTheDocument();
    expect(row.getByText('60 °C')).toBeInTheDocument();
  });

  /**
   * DELETE /zonas/:id falla con 409 ZONA_CON_CONTENEDORES si la zona todavia
   * tiene contenedores. La UI lo adelanta deshabilitando el boton, con el conteo
   * en el tooltip, en vez de dejar que el usuario descubra el limite chocandose.
   */
  it('no deja borrar una zona que todavia tiene contenedores', async () => {
    fetchContainers.mockResolvedValue([
      { id: 'ct-1', zonaId: 'zn-1' },
      { id: 'ct-2', zonaId: 'zn-1' },
    ]);
    render(<ZonesPage />);

    await screen.findByText('Centro');
    const remove = within(rowFor('Centro')).getByRole('button', { name: 'Borrar' });

    await waitFor(() => expect(remove).toBeDisabled());
    expect(remove).toHaveAttribute('title', expect.stringContaining('2 contenedores'));
  });

  it('si el 409 llega igual, muestra cuantos contenedores quedan', async () => {
    const user = userEvent.setup();
    deleteZone.mockRejectedValue(
      new ApiError({
        code: 'ZONA_CON_CONTENEDORES',
        status: 409,
        message: 'La zona "Centro" todavia tiene 7 contenedores asignados',
      }),
    );
    render(<ZonesPage />);

    await screen.findByText('Centro');
    await user.click(within(rowFor('Centro')).getByRole('button', { name: 'Borrar' }));
    await user.click(screen.getByRole('button', { name: 'Borrar zona' }));

    expect(await screen.findByText(/7 contenedores/)).toBeInTheDocument();
    // Ya no ofrece reintentar lo mismo: primero hay que reasignarlos.
    expect(screen.queryByRole('button', { name: 'Borrar zona' })).not.toBeInTheDocument();
  });

  it('bloquear una zona la saca del ruteo', async () => {
    const user = userEvent.setup();
    setZoneBlocked.mockResolvedValue(zone({ bloqueada: true }));
    render(<ZonesPage />);

    await screen.findByText('Centro');
    await user.click(within(rowFor('Centro')).getByRole('button', { name: 'Bloquear' }));

    await waitFor(() => expect(setZoneBlocked).toHaveBeenCalledWith('zn-1', true));
    expect(await screen.findByText('La zona Centro queda excluida del ruteo.')).toBeInTheDocument();
  });

  /**
   * Cambiar umbralCriticoPct no reevalua los contenedores existentes: cada uno
   * se recalcula con su proxima lectura. Quien baja el umbral espera ver medio
   * barrio ponerse rojo al instante, y no pasa nada.
   */
  it('avisa que bajar el umbral no repinta el mapa en el acto', async () => {
    const user = userEvent.setup();
    render(<ZonesPage />);

    await screen.findByText('Centro');
    await user.click(within(rowFor('Centro')).getByRole('button', { name: 'Editar' }));

    const threshold = screen.getByLabelText(/Umbral de llenado/);
    await user.clear(threshold);
    await user.type(threshold, '50');

    expect(await screen.findByText(/no repinta el mapa en el acto/i)).toBeInTheDocument();
  });

  it('no avisa nada si el umbral sube', async () => {
    const user = userEvent.setup();
    render(<ZonesPage />);

    await screen.findByText('Centro');
    await user.click(within(rowFor('Centro')).getByRole('button', { name: 'Editar' }));

    const threshold = screen.getByLabelText(/Umbral de llenado/);
    await user.clear(threshold);
    await user.type(threshold, '90');

    expect(screen.queryByText(/no repinta el mapa/i)).not.toBeInTheDocument();
  });

  it('el nombre duplicado se muestra con su codigo de negocio', async () => {
    const user = userEvent.setup();
    createZone.mockRejectedValue(
      new ApiError({ code: 'ZONA_NOMBRE_DUPLICADO', status: 409, message: 'Ya existe una zona con el nombre "Centro"' }),
    );
    render(<ZonesPage />);

    await user.click(await screen.findByRole('button', { name: /Nueva zona/ }));
    await user.type(screen.getByLabelText(/Nombre/), 'Centro');
    await user.click(screen.getByRole('button', { name: 'Crear zona' }));

    expect(await screen.findByText('[ZONA_NOMBRE_DUPLICADO]')).toBeInTheDocument();
  });
});
