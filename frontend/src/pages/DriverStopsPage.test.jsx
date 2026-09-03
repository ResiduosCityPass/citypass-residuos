import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DriverStopsPage from './DriverStopsPage.jsx';
import { fetchMyRoute, confirmStop } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  fetchMyRoute: vi.fn(),
  confirmStop: vi.fn(),
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
  // Solo `choferId`: la ruta no trae un objeto `chofer` porque el backend no
  // tiene el nombre. Los choferes son usuarios del directorio del Squad 2.
  choferId: 'ldap:mgomez',
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
    confirmStop.mockResolvedValue({
      paradaId: 'pd-02', estado: 'CONFIRMADA', estadoContenedor: 'NORMAL',
      nivelLlenadoPct: 0, alertasCerradas: 0, rutaEstado: 'EN_CURSO',
    });
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
   * `alertasCerradas` es un NUMERO, no una lista de ids: el id de una alerta ya
   * cerrada no le sirve a alguien parado en la vereda. Se cuenta, no se enumera.
   */
  it('cuenta las alertas que cerro la confirmacion', async () => {
    const user = userEvent.setup();
    confirmStop.mockResolvedValue({
      paradaId: 'pd-02', estado: 'CONFIRMADA', estadoContenedor: 'NORMAL',
      nivelLlenadoPct: 0, alertasCerradas: 2, rutaEstado: 'EN_CURSO',
    });
    render(<DriverStopsPage />);

    await user.click(await screen.findByRole('button', { name: 'Confirmar vaciado' }));

    expect(await screen.findByText(/Se cerraron 2 alertas/)).toBeInTheDocument();
  });

  /** La ultima parada cierra la ruta y libera el camion: vale la pena decirlo. */
  it('avisa cuando la ultima parada completa la ruta', async () => {
    const user = userEvent.setup();
    confirmStop.mockResolvedValue({
      paradaId: 'pd-02', estado: 'CONFIRMADA', estadoContenedor: 'NORMAL',
      nivelLlenadoPct: 0, alertasCerradas: 1, rutaEstado: 'COMPLETADA',
    });
    render(<DriverStopsPage />);

    await user.click(await screen.findByRole('button', { name: 'Confirmar vaciado' }));

    expect(await screen.findByText('Última parada: ruta completa')).toBeInTheDocument();
    expect(screen.getByText(/El camión ya quedó disponible/)).toBeInTheDocument();
  });

  /**
   * Un chofer solo confirma paradas de SU ruta. Si llega este 403 la pantalla
   * esta mostrando una ruta que ya no le corresponde, asi que se recarga: no
   * tiene sentido dejarlo insistiendo con un boton que no puede funcionar.
   */
  it('una parada de otra ruta se explica y dispara una recarga', async () => {
    const user = userEvent.setup();
    confirmStop.mockRejectedValue(
      new ApiError({
        code: 'PARADA_DE_OTRA_RUTA',
        status: 403,
        message: 'La parada pd-02 no pertenece a tu ruta activa',
      }),
    );
    render(<DriverStopsPage />);

    await user.click(await screen.findByRole('button', { name: 'Confirmar vaciado' }));

    expect(await screen.findByText('Esta parada no es de tu ruta')).toBeInTheDocument();
    // No es un problema de rol: el chofer TIENE el rol.
    expect(screen.queryByText(/No tenes permisos/i)).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMyRoute).toHaveBeenCalledTimes(2));
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

  /**
   * La identidad sale del `sub` del token. No hay —ni puede haber— forma de
   * pedir la ruta de otro chofer: si viajara por parametro, cambiar un valor
   * alcanzaria para leer el trabajo ajeno.
   */
  it('pide la ruta sin ningun parametro de chofer', async () => {
    render(<DriverStopsPage />);

    await screen.findByText('CT-0010');
    expect(fetchMyRoute).toHaveBeenCalledWith();
    expect(screen.queryByLabelText('Chofer')).not.toBeInTheDocument();
  });

  /** Con VITE_SIMULAR_GPS apagada —el default— el bypass no existe. */
  it('sin la variable de entorno no aparece el simulador de GPS', async () => {
    render(<DriverStopsPage />);

    await screen.findByText('CT-0010');
    expect(screen.queryByLabelText(/Simular que estoy en el contenedor/)).not.toBeInTheDocument();
  });

  it('muestra el nivel de llenado de cada parada', async () => {
    render(<DriverStopsPage />);

    const item = (await screen.findByText('CT-0010')).closest('li');
    expect(within(item).getByText('88%')).toBeInTheDocument();
  });
});
