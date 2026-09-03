import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapPage from './MapPage.jsx';
import { fetchMapContainers, fetchZones } from '../api/waste.js';
import { saveToken, clearToken } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchMapContainers: vi.fn(),
  fetchZones: vi.fn(),
  fetchContainer: vi.fn(),
}));

// Leaflet necesita un contenedor con tamano real, que jsdom no tiene. La pantalla
// se prueba con el mapa reemplazado por un stub; el mapa en si se verifica a mano.
vi.mock('../components/ContainersMap.jsx', () => ({
  default: ({ containers }) => <div data-testid="mapa">{containers.length} marcadores</div>,
}));

const container = (extras = {}) => ({
  id: 'c-1',
  codigo: 'CT-0001',
  lat: -34.6,
  lng: -58.38,
  estado: 'NORMAL',
  tipoResiduo: 'COMUN',
  nivelLlenadoPct: 5,
  ultimaLecturaEn: '2026-08-20T22:50:02.199Z',
  zonaNombre: 'Centro',
  umbralCriticoPct: 70,
  incendioActivo: false,
  ...extras,
});

/**
 * Lee el numero de la tarjeta de resumen cuya etiqueta es `etiqueta`.
 * Se acota al bloque de tarjetas porque "Normal" y "Critico" tambien son
 * opciones del <select> de estado, y una busqueda global encuentra las dos.
 */
const cardNumber = (label) => {
  const cards = within(document.querySelector('.cards'));
  return cards.getByText(label).closest('.card').querySelector('.card-number')
    .textContent;
};

describe('pantalla del mapa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearToken();
    fetchZones.mockResolvedValue([{ id: 'z-1', nombre: 'Centro', umbralCriticoPct: 70 }]);
  });

  it('resume cuantos contenedores hay en cada estado', async () => {
    fetchMapContainers.mockResolvedValue([
      container(),
      container({ id: 'c-2', estado: 'CRITICO' }),
      container({ id: 'c-3', estado: 'CRITICO' }),
    ]);

    render(<MapPage tokenVersion={0} />);

    expect(await screen.findByText('3 marcadores')).toBeInTheDocument();
    expect(cardNumber('Critico')).toBe('2');
    expect(cardNumber('Normal')).toBe('1');
  });

  it('cuenta los incendios abiertos aparte del estado del contenedor', async () => {
    // `incendioActivo` viene en el propio payload del mapa: una sola llamada.
    fetchMapContainers.mockResolvedValue([container({ incendioActivo: true })]);

    render(<MapPage tokenVersion={0} />);

    // El contenedor sigue contando como NORMAL: el incendio no depende del llenado.
    expect(await screen.findByText('1 marcadores')).toBeInTheDocument();
    expect(cardNumber('Normal')).toBe('1');
    expect(cardNumber('Incendios abiertos')).toBe('1');
  });

  it('al filtrar por una tarjeta el mapa se achica pero los conteos no', async () => {
    fetchMapContainers.mockResolvedValue([
      container(),
      container({ id: 'c-2', estado: 'CRITICO' }),
      container({ id: 'c-3', estado: 'CRITICO' }),
    ]);

    render(<MapPage tokenVersion={0} />);
    expect(await screen.findByText('3 marcadores')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /solo los de estado Critico/i }));

    // El mapa dibuja solo los dos criticos...
    expect(await screen.findByText('2 marcadores')).toBeInTheDocument();
    // ...pero las tarjetas siguen contando todo: si Normal quedara en 0, no
    // habria forma de saber que hay adonde volver.
    expect(cardNumber('Normal')).toBe('1');
    expect(cardNumber('Critico')).toBe('2');
  });

  it('el filtro de estado no viaja al backend: se resuelve en el cliente', async () => {
    fetchMapContainers.mockResolvedValue([container({ estado: 'CRITICO' })]);

    render(<MapPage tokenVersion={0} />);
    await screen.findByTestId('mapa');
    fetchMapContainers.mockClear();

    await userEvent.click(screen.getByRole('button', { name: /solo los de estado Critico/i }));

    expect(fetchMapContainers).not.toHaveBeenCalled();
  });

  it('la tarjeta de incendios filtra el mapa, no solo informa', async () => {
    fetchMapContainers.mockResolvedValue([
      container({ incendioActivo: true }),
      container({ id: 'c-2', estado: 'CRITICO' }),
    ]);

    render(<MapPage tokenVersion={0} />);
    expect(await screen.findByText('2 marcadores')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /solo los que tienen incendio/i }));

    // Queda el NORMAL que se esta incendiando, que es el caso de CU-06.
    expect(await screen.findByText('1 marcadores')).toBeInTheDocument();
    expect(cardNumber('Critico')).toBe('1');
  });

  it('ante un 401 explica como generar el token en lugar de mostrar el error crudo', async () => {
    fetchMapContainers.mockRejectedValue({ code: 'HTTP_401', message: 'Falta el header' });

    render(<MapPage tokenVersion={0} />);

    expect(await screen.findByText(/npm run token:dev/)).toBeInTheDocument();
  });

  it('carga las zonas para el filtro cuando hay token', async () => {
    saveToken('un-jwt');
    fetchMapContainers.mockResolvedValue([]);

    render(<MapPage tokenVersion={0} />);

    await waitFor(() => expect(fetchZones).toHaveBeenCalled());
    expect(await screen.findByText('Centro (umbral 70%)')).toBeInTheDocument();
  });

  it('no pide las zonas si todavia no cargaste el token', async () => {
    fetchMapContainers.mockResolvedValue([]);

    render(<MapPage tokenVersion={0} />);

    await screen.findByTestId('mapa');
    expect(fetchZones).not.toHaveBeenCalled();
  });
});
