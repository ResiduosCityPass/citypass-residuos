import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DriverStopsPage from './DriverStopsPage.jsx';
import { fetchMyRoute, confirmStop, fetchDrivers } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  // Sin mocks no aparece el selector de chofer ni el simulador de GPS: se
  // prueba la pantalla como la ve un chofer contra el backend real.
  USING_MOCKS: false,
  fetchMyRoute: vi.fn(),
  confirmStop: vi.fn(),
  fetchDrivers: vi.fn(),
}));

vi.mock('../components/routes/RouteMap.jsx', () => ({
  default: ({ stops }) => <div data-testid="mapa-ruta">{stops.length} paradas</div>,
}));

const getCurrentPosition = vi.fn();

const grant = (lat, lng) =>
  getCurrentPosition.mockImplementation((ok) =>
    ok({ coords: { latitude: lat, longitude: lng, accuracy: 8 } }),
  );

const deny = () =>
  getCurrentPosition.mockImplementation((_, ko) => ko({ code: 1, message: 'denied' }));

const CONTAINER = { id: 'ct-10', codigo: 'CT-0010', lat: -34.5949, lng: -58.4012, estado: 'CRITICO', nivelLlenadoPct: 88 };

const stop = (extras = {}) => ({
  id: 'pd-02',
  rutaId: 'rt-01',
  orden: 2,
  estado: 'PENDIENTE',
  confirmadaEn: null,
  contenedor: CONTAINER,
  ...extras,
});

const route = (paradas = [stop()]) => ({
  id: 'rt-01',
  estado: 'EN_CURSO',
  distanciaEstimadaKm: 7.4,
  camion: { id: 'cm-01', patente: 'AB123CD' },
  chofer: { id: 'ldap:mgomez', nombre: 'Maria Gomez' },
  paradas,
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
  });
  fetchMyRoute.mockResolvedValue(route());
  fetchDrivers.mockResolvedValue([]);
  grant(CONTAINER.lat, CONTAINER.lng);
});

afterEach(() => {
  delete globalThis.navigator.geolocation;
});

describe('CU-10 · confirmar vaciado', () => {
  it('solo las paradas pendientes ofrecen el boton', async () => {
    fetchMyRoute.mockResolvedValue(
      route([
        stop({ id: 'pd-01', orden: 1, estado: 'CONFIRMADA', confirmadaEn: new Date().toISOString() }),
        stop({ id: 'pd-02', orden: 2, estado: 'PENDIENTE' }),
        stop({ id: 'pd-03', orden: 3, estado: 'OMITIDA' }),
      ]),
    );
    render(<DriverStopsPage />);

    await screen.findByText('Confirmada');
    // Una sola parada pendiente, un solo boton.
    expect(screen.getAllByRole('button', { name: 'Confirmar vaciado' })).toHaveLength(1);
    // OMITIDA se muestra aunque no haya endpoint que la produzca.
    expect(screen.getByText('Omitida')).toBeInTheDocument();
  });

  it('confirma mandando exactamente la posicion del GPS', async () => {
    const user = userEvent.setup();
    confirmStop.mockResolvedValue({ paradaId: 'pd-02', estado: 'CONFIRMADA' });
    render(<DriverStopsPage />);

    await user.click(await screen.findByRole('button', { name: 'Confirmar vaciado' }));

    await waitFor(() =>
      expect(confirmStop).toHaveBeenCalledWith('pd-02', {
        lat: CONTAINER.lat,
        lng: CONTAINER.lng,
      }),
    );
    expect(await screen.findByText('Vaciado confirmado')).toBeInTheDocument();
  });

  /**
   * El 403 de este caso de uso no es un problema de permisos: el chofer tiene
   * el rol, lo que no tiene es la cercania. Decirle "no tenes permisos" lo
   * manda a buscar un problema que no existe.
   */
  it('fuera del radio dice a cuanto esta, no que le faltan permisos', async () => {
    const user = userEvent.setup();
    // El chofer esta en el Obelisco; el contenedor, en Palermo.
    grant(-34.6037, -58.3816);
    confirmStop.mockRejectedValue(
      new ApiError({
        code: 'PARADA_FUERA_DE_RADIO',
        status: 403,
        message: 'Estas a 3100 m del contenedor CT-0010. El maximo permitido es 100 m',
      }),
    );
    render(<DriverStopsPage />);

    await user.click(await screen.findByRole('button', { name: 'Confirmar vaciado' }));

    expect(await screen.findByText('Estás demasiado lejos')).toBeInTheDocument();
    expect(screen.getByText(/Acercate a menos de 100 m/)).toBeInTheDocument();
    expect(screen.queryByText(/No tenes permisos/i)).not.toBeInTheDocument();
  });

  it('una parada ya confirmada se resincroniza sin alarmar', async () => {
    const user = userEvent.setup();
    confirmStop.mockRejectedValue(
      new ApiError({ code: 'PARADA_YA_CONFIRMADA', status: 409, message: 'La parada 2 ya fue confirmada' }),
    );
    render(<DriverStopsPage />);

    await user.click(await screen.findByRole('button', { name: 'Confirmar vaciado' }));

    const notice = await screen.findByText('Esta parada ya figura confirmada');
    // Es info, no error: casi siempre es un doble tap o el otro dispositivo.
    expect(notice.closest('.notice')).toHaveClass('notice-info');
    // Y se vuelve a pedir la ruta para quedar sincronizado.
    await waitFor(() => expect(fetchMyRoute).toHaveBeenCalledTimes(2));
  });

  it('cualquier otro error se muestra con su code estable', async () => {
    const user = userEvent.setup();
    confirmStop.mockRejectedValue(
      new ApiError({ code: 'PARADA_NO_ENCONTRADA', status: 404, message: 'No existe la parada pd-02' }),
    );
    render(<DriverStopsPage />);

    await user.click(await screen.findByRole('button', { name: 'Confirmar vaciado' }));

    expect(await screen.findByText('[PARADA_NO_ENCONTRADA]')).toBeInTheDocument();
  });

  /**
   * Sin GPS no se confirma y no hay carga manual de coordenadas, a diferencia
   * de CU-11: dejarle escribir la posicion al chofer anula el unico control
   * que tiene este caso de uso.
   */
  it('si el chofer niega el GPS no se confirma nada', async () => {
    const user = userEvent.setup();
    deny();
    render(<DriverStopsPage />);

    await user.click(await screen.findByRole('button', { name: 'Confirmar vaciado' }));

    expect(await screen.findByText('No pudimos ubicarte')).toBeInTheDocument();
    expect(confirmStop).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Latitud/)).not.toBeInTheDocument();
  });

  it('el progreso cuenta las paradas ya vaciadas', async () => {
    fetchMyRoute.mockResolvedValue(
      route([
        stop({ id: 'pd-01', orden: 1, estado: 'CONFIRMADA' }),
        stop({ id: 'pd-02', orden: 2, estado: 'CONFIRMADA' }),
        stop({ id: 'pd-03', orden: 3, estado: 'PENDIENTE' }),
      ]),
    );
    render(<DriverStopsPage />);

    expect(await screen.findByText('2 de 3 vaciados')).toBeInTheDocument();
  });

  it('sin ruta activa lo dice, en vez de mostrar una pantalla vacia', async () => {
    fetchMyRoute.mockResolvedValue(null);
    render(<DriverStopsPage />);

    expect(await screen.findByText('No tenés ninguna ruta asignada')).toBeInTheDocument();
    expect(screen.getByText('Sin ruta activa')).toBeInTheDocument();
  });

  /** El contrato no define si /rutas/mias devuelve objeto o array. Los dos entran. */
  it('acepta que el backend devuelva un array de una ruta', async () => {
    fetchMyRoute.mockResolvedValue([route()]);
    render(<DriverStopsPage />);

    expect(await screen.findByText('AB123CD')).toBeInTheDocument();
  });

  it('sin mocks no aparece el selector de chofer de demostracion', async () => {
    render(<DriverStopsPage />);

    await screen.findByText('CT-0010');
    expect(screen.queryByLabelText('Chofer')).not.toBeInTheDocument();
    expect(fetchDrivers).not.toHaveBeenCalled();
  });

  it('muestra el nivel de llenado de cada parada', async () => {
    render(<DriverStopsPage />);

    const item = (await screen.findByText('CT-0010')).closest('li');
    expect(within(item).getByText('88%')).toBeInTheDocument();
  });
});
