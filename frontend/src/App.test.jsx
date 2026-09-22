import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  fetchTrucks: vi.fn(() => Promise.resolve([])),
  fetchDrivers: vi.fn(() => Promise.resolve([])),
  fetchRoutes: vi.fn(() => Promise.resolve([])),
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

  /**
   * Los codigos de caso de uso son vocabulario de la catedra. El operador no
   * sabe que es un "CU-07" y en la demo no tienen que aparecer en ningun lado:
   * ni en el menu, ni en el subtitulo de ninguna pantalla.
   */
  it.each(['/mapa', '/contenedores', '/zonas', '/alertas', '/flota', '/choferes', '/rutas'])(
    '%s no muestra codigos de caso de uso',
    async (path) => {
      window.history.pushState({}, '', path);
      const { container } = render(<App />);

      await screen.findByRole('navigation', { name: /Modulos de CityPass/ });
      expect(container.querySelector('.topbar').textContent).not.toMatch(/CU-?\d/);
      expect(container.querySelector('.sidebar').textContent).not.toMatch(/CU-?\d/);
    },
  );

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

  /**
   * El menu lateral en pantallas angostas.
   *
   * Lo que jsdom NO puede probar es el punto de corte: no evalua media queries,
   * asi que aca el boton esta siempre presente y el sidebar siempre montado.
   * Que se escondan en escritorio es cosa del CSS y se verifica en el navegador.
   * Lo que si se puede fijar —y es lo que se rompe cuando alguien toca esto— es
   * la maquinaria: que el boton abra, que Escape cierre y que navegar cierre.
   */
  describe('menu lateral', () => {
    // Anclado: la X de adentro del cajon se llama "Cerrar el menu" y este
    // boton, "Abrir menu" / "Cerrar menu". Sin anclar, el patron agarra los dos.
    const menuButton = () => screen.getByRole('button', { name: /^(Abrir|Cerrar) menu$/ });

    it('el boton abre y cierra el cajon', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/mapa');
      render(<App />);

      const nav = await screen.findByRole('navigation', { name: /Modulos de CityPass/ });
      expect(nav).not.toHaveClass('open');
      expect(menuButton()).toHaveAttribute('aria-expanded', 'false');

      await user.click(menuButton());
      expect(nav).toHaveClass('open');
      expect(menuButton()).toHaveAttribute('aria-expanded', 'true');

      await user.click(menuButton());
      expect(nav).not.toHaveClass('open');
    });

    /**
     * Sin esto el menu queda tapando la pantalla a la que se acaba de entrar, y
     * en un celular ocupa el ancho entero: parece que el click no hizo nada.
     */
    it('navegar desde el cajon lo cierra', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/mapa');
      render(<App />);

      const nav = await screen.findByRole('navigation', { name: /Modulos de CityPass/ });
      await user.click(menuButton());
      expect(nav).toHaveClass('open');

      await user.click(within(nav).getByRole('link', { name: /Zonas y umbrales/ }));

      expect(await screen.findByRole('heading', { name: 'Zonas y umbrales' })).toBeInTheDocument();
      expect(nav).not.toHaveClass('open');
    });

    it('Escape cierra el cajon', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/mapa');
      render(<App />);

      const nav = await screen.findByRole('navigation', { name: /Modulos de CityPass/ });
      await user.click(menuButton());
      expect(nav).toHaveClass('open');

      await user.keyboard('{Escape}');
      expect(nav).not.toHaveClass('open');
    });

    /**
     * Mientras el cajon esta abierto la pantalla de atras no scrollea. Es lo que
     * evita que arrastrar el dedo sobre el menu mueva el contenido y al cerrar
     * aparezca en otro lugar del que estaba.
     */
    it('el cajon abierto traba el scroll de atras y al cerrarlo lo devuelve', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/mapa');
      render(<App />);

      await screen.findByRole('navigation', { name: /Modulos de CityPass/ });
      expect(document.body).not.toHaveClass('no-scroll');

      await user.click(menuButton());
      expect(document.body).toHaveClass('no-scroll');

      await user.keyboard('{Escape}');
      expect(document.body).not.toHaveClass('no-scroll');
    });
  });
});
