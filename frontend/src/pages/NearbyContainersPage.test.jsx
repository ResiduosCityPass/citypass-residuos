import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NearbyContainersPage from './NearbyContainersPage.jsx';
import { fetchNearbyContainers } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchNearbyContainers: vi.fn(),
}));

// Leaflet necesita un contenedor con tamano real, que jsdom no tiene.
vi.mock('../components/public/NearbyMap.jsx', () => ({
  default: ({ containers }) => <div data-testid="mapa">{containers.length} marcadores</div>,
}));

/**
 * jsdom no implementa navigator.geolocation. Se define solo esa propiedad (no
 * el navigator entero: vi.stubGlobal rompe user-event, que lee clipboard y
 * userAgent) y se borra despues de cada test.
 */
const getCurrentPosition = vi.fn();

const grant = (lat, lng) =>
  getCurrentPosition.mockImplementation((ok) =>
    ok({ coords: { latitude: lat, longitude: lng, accuracy: 10 } }),
  );

const deny = () =>
  getCurrentPosition.mockImplementation((_, ko) => ko({ code: 1, message: 'denied' }));

const nearby = (extras = {}) => ({
  id: 'ct-01',
  codigo: 'CT-0001',
  lat: -34.6037,
  lng: -58.3816,
  tipoResiduo: 'RECICLABLE',
  distanciaMetros: 120,
  ...extras,
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
  });
  fetchNearbyContainers.mockResolvedValue([nearby()]);
});

afterEach(() => {
  delete globalThis.navigator.geolocation;
});

describe('CU-11 · consultar contenedores cercanos', () => {
  it('no pide nada hasta que sabe desde donde buscar', () => {
    render(<NearbyContainersPage />);

    expect(screen.getByRole('button', { name: 'Usar mi ubicacion' })).toBeInTheDocument();
    expect(fetchNearbyContainers).not.toHaveBeenCalled();
  });

  it('con la ubicacion del navegador busca en el radio por defecto', async () => {
    const user = userEvent.setup();
    grant(-34.6037, -58.3816);
    render(<NearbyContainersPage />);

    await user.click(screen.getByRole('button', { name: 'Usar mi ubicacion' }));

    await waitFor(() =>
      expect(fetchNearbyContainers).toHaveBeenCalledWith({
        lat: -34.6037,
        lng: -58.3816,
        radioMetros: 1000,
        tipoResiduo: '',
      }),
    );
  });

  it('ordena la lista por distancia, del mas cerca al mas lejos', async () => {
    const user = userEvent.setup();
    grant(-34.6037, -58.3816);
    fetchNearbyContainers.mockResolvedValue([
      nearby({ id: 'ct-lejos', codigo: 'CT-0009', distanciaMetros: 800 }),
      nearby({ id: 'ct-cerca', codigo: 'CT-0002', distanciaMetros: 90 }),
    ]);
    render(<NearbyContainersPage />);

    await user.click(screen.getByRole('button', { name: 'Usar mi ubicacion' }));

    const items = await screen.findAllByRole('listitem');
    const conCodigo = items.filter((li) => li.textContent.includes('CT-'));
    expect(within(conCodigo[0]).getByText('CT-0002')).toBeInTheDocument();
    expect(within(conCodigo[0]).getByText('90 m')).toBeInTheDocument();
    expect(within(conCodigo[1]).getByText('CT-0009')).toBeInTheDocument();
  });

  /**
   * La regla de privacidad del caso de uso, como test ejecutable: el nivel de
   * llenado y el estado son informacion operativa interna. Si alguien manana
   * reusa el componente del mapa del operador o proyecta el payload con un
   * spread, este test se pone en rojo.
   */
  it('no muestra el nivel de llenado ni el estado del contenedor', async () => {
    const user = userEvent.setup();
    grant(-34.6037, -58.3816);
    // Un payload contaminado, como si el backend mandara de mas.
    fetchNearbyContainers.mockResolvedValue([
      nearby({ nivelLlenadoPct: 87, estado: 'CRITICO' }),
    ]);
    render(<NearbyContainersPage />);

    await user.click(screen.getByRole('button', { name: 'Usar mi ubicacion' }));

    await screen.findByText('CT-0001');
    expect(screen.queryByText(/87/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Critico/i)).not.toBeInTheDocument();
  });

  it('si el navegador niega el permiso, ofrece cargar la ubicacion a mano', async () => {
    const user = userEvent.setup();
    deny();
    render(<NearbyContainersPage />);

    await user.click(screen.getByRole('button', { name: 'Usar mi ubicacion' }));

    // El mensaje dice que hacer, no solo que fallo.
    expect(await screen.findByText(/candado de la barra de direcciones/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Obelisco' })).toBeInTheDocument();
    expect(fetchNearbyContainers).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Obelisco' }));

    await waitFor(() =>
      expect(fetchNearbyContainers).toHaveBeenCalledWith(
        expect.objectContaining({ lat: -34.6037, lng: -58.3816 }),
      ),
    );
  });

  it('cambiar el tipo de residuo vuelve a buscar con el filtro', async () => {
    const user = userEvent.setup();
    grant(-34.6037, -58.3816);
    render(<NearbyContainersPage />);

    await user.click(screen.getByRole('button', { name: 'Usar mi ubicacion' }));
    await screen.findByLabelText('Tipo de residuo');

    await user.selectOptions(screen.getByLabelText('Tipo de residuo'), 'ORGANICO');

    await waitFor(() =>
      expect(fetchNearbyContainers).toHaveBeenLastCalledWith(
        expect.objectContaining({ tipoResiduo: 'ORGANICO' }),
      ),
    );
  });

  it('cambiar el radio vuelve a buscar', async () => {
    const user = userEvent.setup();
    grant(-34.6037, -58.3816);
    render(<NearbyContainersPage />);

    await user.click(screen.getByRole('button', { name: 'Usar mi ubicacion' }));
    await screen.findByLabelText('Radio');

    await user.selectOptions(screen.getByLabelText('Radio'), '300');

    await waitFor(() =>
      expect(fetchNearbyContainers).toHaveBeenLastCalledWith(
        expect.objectContaining({ radioMetros: 300 }),
      ),
    );
  });

  it('sin resultados lo dice y sugiere que hacer', async () => {
    const user = userEvent.setup();
    grant(-34.6037, -58.3816);
    fetchNearbyContainers.mockResolvedValue([]);
    render(<NearbyContainersPage />);

    await user.click(screen.getByRole('button', { name: 'Usar mi ubicacion' }));

    expect(await screen.findByText('No hay contenedores en ese radio')).toBeInTheDocument();
  });

  it('un error de la API se muestra con su code estable', async () => {
    const user = userEvent.setup();
    grant(-34.6037, -58.3816);
    fetchNearbyContainers.mockRejectedValue(
      new ApiError({ code: 'SIN_CONEXION', status: 0, message: 'No se pudo contactar la API.' }),
    );
    render(<NearbyContainersPage />);

    await user.click(screen.getByRole('button', { name: 'Usar mi ubicacion' }));

    expect(await screen.findByText('[SIN_CONEXION]')).toBeInTheDocument();
  });
});
