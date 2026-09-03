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

/**
 * Captura de `GET /rutas`. Trae `camion` expandido pero NO `paradas` ni un
 * objeto `chofer`: eso lo devuelve solo el detalle de una ruta. El fixture
 * anterior incluia los dos y por eso los tests pasaban mientras la pantalla
 * reventaba contra el backend real leyendo `r.paradas.length`.
 */
const route = (extras = {}) => ({
  id: 'rt-1',
  camionId: 'cm-1',
  camion: { id: 'cm-1', patente: 'AB123CD', capacidadLitros: 12000 },
  choferId: 'dev-chofer',
  estado: 'ASIGNADA',
  distanciaEstimadaKm: 7.4,
  litrosEstimados: 3300,
  generadaEn: new Date().toISOString(),
  asignadaEn: new Date().toISOString(),
  completadaEn: null,
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

  it('muestra la carga estimada de cada ruta', async () => {
    mount();
    expect(await screen.findByText('3.300 L')).toBeInTheDocument();
  });

  /**
   * El listado no trae `paradas` ni `chofer`. La pantalla tiene que dibujarse
   * igual con la respuesta tal cual viene, sin inventarse campos: leerlos era
   * lo que la tiraba abajo con una pantalla en blanco.
   */
  it('se dibuja con la respuesta real del listado, sin paradas ni chofer', async () => {
    mount();

    expect(await screen.findByText('AB123CD')).toBeInTheDocument();
    // El identificador del chofer es todo lo que hay: no tenemos su nombre.
    expect(screen.getByText('dev-chofer')).toBeInTheDocument();
  });

  it('una ruta sin chofer lo dice en vez de romperse', async () => {
    fetchRoutes.mockResolvedValue([route({ estado: 'PROPUESTA', choferId: null })]);
    mount();

    expect(await screen.findByText('sin asignar')).toBeInTheDocument();
  });

  /**
   * Una ruta propuesta no esta asignada y no la ve ningun chofer: si queda ahi
   * olvidada, los contenedores que reservo no entran en ninguna otra ruta.
   */
  it('destaca las propuestas sin confirmar', async () => {
    fetchRoutes.mockResolvedValue([route({ estado: 'PROPUESTA', choferId: null })]);
    mount();

    expect(await screen.findByText('Hay 1 propuesta(s) sin confirmar')).toBeInTheDocument();
  });

  it('sin propuestas pendientes no mete el cartel', async () => {
    mount();
    await screen.findByText('3.300 L');
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
