import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import {
  fetchAlerts,
  fetchZones,
  fetchMapContainers,
  fetchContainers,
  fetchMyRoute,
} from './api/waste.js';

vi.mock('./api/waste.js', () => ({
  USING_MOCKS: true,
  fetchMapContainers: vi.fn(),
  fetchContainers: vi.fn(),
  fetchContainer: vi.fn(),
  fetchZones: vi.fn(),
  fetchAlerts: vi.fn(),
  createContainer: vi.fn(),
  updateContainer: vi.fn(),
  deleteContainer: vi.fn(),
  linkSensor: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  setZoneBlocked: vi.fn(),
  deleteZone: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
  fetchMyRoute: vi.fn(),
  confirmStop: vi.fn(),
  fetchNearbyContainers: vi.fn(),
}));

vi.mock('./components/ContainersMap.jsx', () => ({
  default: () => <div data-testid="mapa" />,
}));

// Leaflet necesita un contenedor con tamano real, que jsdom no da.
vi.mock('./components/public/NearbyMap.jsx', () => ({
  default: () => <div data-testid="mapa-cercanos" />,
}));

vi.mock('./components/routes/RouteMap.jsx', () => ({
  default: () => <div data-testid="mapa-ruta" />,
}));

const alert = (estado) => ({
  id: `al-${estado}`,
  contenedorId: 'ct-1',
  tipo: 'SATURACION',
  severidad: 'MEDIA',
  estado,
  detalle: 'Nivel 76% supera el umbral 70%',
  detectadaEn: new Date().toISOString(),
  resueltaEn: null,
});

describe('shell de la aplicacion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
    fetchMapContainers.mockResolvedValue([]);
    fetchContainers.mockResolvedValue([]);
    fetchZones.mockResolvedValue([]);
    fetchAlerts.mockResolvedValue([]);
    fetchMyRoute.mockResolvedValue(null);
  });

  it('arranca en el mapa', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Mapa en tiempo real' })).toBeInTheDocument();
  });

  it('navega entre las cuatro secciones del modulo', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('link', { name: /Contenedores/ }));
    expect(await screen.findByRole('heading', { name: 'Contenedores' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Zonas y umbrales/ }));
    expect(await screen.findByRole('heading', { name: 'Zonas y umbrales' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Alertas/ }));
    expect(await screen.findByRole('heading', { name: 'Alertas' })).toBeInTheDocument();
  });

  /**
   * Los modulos de otros squads se muestran para dejar ver donde encaja
   * Residuos dentro de CityPass+, pero no son navegables: no existen.
   */
  it('los modulos de otros squads no son enlaces', () => {
    render(<App />);

    expect(screen.queryByRole('link', { name: /Movilidad/ })).not.toBeInTheDocument();
    expect(screen.getByTitle(/Movilidad lo desarrolla el Squad 3/)).toBeInTheDocument();
  });

  it('el globo cuenta solo las alertas que alguien todavia tiene que atender', async () => {
    fetchAlerts.mockResolvedValue([alert('ABIERTA'), alert('EN_ATENCION'), alert('RESUELTA')]);
    render(<App />);

    // La resuelta ya no le pide nada a nadie: quedan 2.
    await waitFor(() => expect(screen.getByTitle('2 alertas sin resolver')).toBeInTheDocument());
  });

  /**
   * Un tablero de alertas creible con datos inventados y sin cartel es la clase
   * de cosa que termina en una captura de pantalla de una demo.
   */
  it('avisa en pantalla cuando los datos son de demostracion', async () => {
    render(<App />);

    expect(await screen.findByText('Datos de demostracion')).toBeInTheDocument();
    // Con mocks no hay token que cargar: el parche de desarrollo se esconde.
    expect(screen.queryByRole('button', { name: 'Token' })).not.toBeInTheDocument();
  });

  it('una ruta inexistente vuelve al mapa', async () => {
    window.history.pushState({}, '', '/no-existe');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Mapa en tiempo real' })).toBeInTheDocument();
  });

  /**
   * CU-11 vive fuera del Shell. Si quedara adentro, el useEffect del globo
   * pediria /alertas sin token en cada carga: un 401 garantizado para alimentar
   * un contador que el ciudadano no ve.
   */
  it('la vista ciudadana no pide alertas ni muestra el sidebar', async () => {
    window.history.pushState({}, '', '/cerca');
    render(<App />);

    expect(await screen.findByRole('heading', { name: /Donde tiro esto/ })).toBeInTheDocument();
    expect(fetchAlerts).not.toHaveBeenCalled();
    expect(screen.queryByRole('navigation', { name: /Modulos de CityPass/ })).not.toBeInTheDocument();
  });

  it('la vista del chofer tampoco monta el shell del operador', async () => {
    window.history.pushState({}, '', '/chofer');
    render(<App />);

    await waitFor(() => expect(fetchMyRoute).toHaveBeenCalled());
    expect(fetchAlerts).not.toHaveBeenCalled();
    expect(screen.queryByRole('navigation', { name: /Modulos de CityPass/ })).not.toBeInTheDocument();
  });
});
