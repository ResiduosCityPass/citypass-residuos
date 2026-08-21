import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RoutesPage from './RoutesPage.jsx';
import { fetchRoutes, fetchTrucks, fetchZones, generateRoute } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchRoutes: vi.fn(),
  fetchTrucks: vi.fn(),
  fetchZones: vi.fn(),
  generateRoute: vi.fn(),
}));

const truck = (id, plate, extras = {}) => ({
  id, patente: plate, capacidadLitros: 12000,
  tipoResiduoHabilitado: 'COMUN', estado: 'DISPONIBLE', ...extras,
});

const route = (extras = {}) => ({
  id: 'rt-1',
  estado: 'ASIGNADA',
  distanciaEstimadaKm: 7.4,
  generadaEn: new Date().toISOString(),
  camion: { patente: 'AB123CD' },
  chofer: { nombre: 'Juan Perez' },
  paradas: [
    { id: 'p1', estado: 'CONFIRMADA' },
    { id: 'p2', estado: 'PENDIENTE' },
  ],
  ...extras,
});

const mount = () => render(<MemoryRouter><RoutesPage /></MemoryRouter>);

describe('CU-08 · rutas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRoutes.mockResolvedValue([route()]);
    fetchTrucks.mockResolvedValue([truck('cm-1', 'AB123CD')]);
    fetchZones.mockResolvedValue([{ id: 'zn-1', nombre: 'Centro', bloqueada: false }]);
  });

  it('muestra el avance de cada ruta en paradas confirmadas', async () => {
    mount();
    expect(await screen.findByText('1/2')).toBeInTheDocument();
  });

  /**
   * Una ruta propuesta no esta asignada y no la ve ningun chofer: si queda ahi
   * olvidada, los contenedores que reservo no entran en ninguna otra ruta.
   */
  it('destaca las propuestas sin confirmar', async () => {
    fetchRoutes.mockResolvedValue([route({ estado: 'PROPUESTA', chofer: null })]);
    mount();

    expect(await screen.findByText('Hay 1 propuesta(s) sin confirmar')).toBeInTheDocument();
  });

  it('sin propuestas pendientes no mete el cartel', async () => {
    mount();
    await screen.findByText('1/2');
    expect(screen.queryByText(/propuesta\(s\) sin confirmar/)).not.toBeInTheDocument();
  });

  it('solo ofrece camiones disponibles, y dice cuantos quedaron afuera', async () => {
    const user = userEvent.setup();
    fetchTrucks.mockResolvedValue([
      truck('cm-1', 'AB123CD'),
      truck('cm-2', 'AC456EF', { estado: 'EN_RUTA' }),
      truck('cm-3', 'AD789GH', { estado: 'MANTENIMIENTO' }),
    ]);
    mount();

    await user.click(await screen.findByRole('button', { name: /Generar ruta/ }));

    const select = screen.getByLabelText(/Camion/);
    expect(within(select).queryByText(/AC456EF/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 camión\(es\) no aparecen/)).toBeInTheDocument();
  });

  it('sin camiones disponibles no deja generar', async () => {
    const user = userEvent.setup();
    fetchTrucks.mockResolvedValue([truck('cm-2', 'AC456EF', { estado: 'EN_RUTA' })]);
    mount();

    await user.click(await screen.findByRole('button', { name: /Generar ruta/ }));

    expect(screen.getByText('No hay camiones disponibles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar propuesta' })).toBeDisabled();
  });

  it('las zonas bloqueadas no se ofrecen: quedan excluidas del ruteo', async () => {
    const user = userEvent.setup();
    fetchZones.mockResolvedValue([
      { id: 'zn-1', nombre: 'Centro', bloqueada: false },
      { id: 'zn-2', nombre: 'Chacarita', bloqueada: true },
    ]);
    mount();

    await user.click(await screen.findByRole('button', { name: /Generar ruta/ }));

    const select = screen.getByLabelText(/Zona/);
    expect(within(select).getByText('Centro')).toBeInTheDocument();
    expect(within(select).queryByText('Chacarita')).not.toBeInTheDocument();
  });

  it('si no hay contenedores para rutear lo dice con el codigo del backend', async () => {
    const user = userEvent.setup();
    generateRoute.mockRejectedValue(
      new ApiError({
        code: 'RUTA_SIN_CONTENEDORES',
        status: 409,
        message: 'No hay contenedores criticos de tipo COMUN sin rutear para este camion',
      }),
    );
    mount();

    await user.click(await screen.findByRole('button', { name: /Generar ruta/ }));
    await user.click(screen.getByRole('button', { name: 'Generar propuesta' }));

    expect(await screen.findByText('[RUTA_SIN_CONTENEDORES]')).toBeInTheDocument();
  });
});
