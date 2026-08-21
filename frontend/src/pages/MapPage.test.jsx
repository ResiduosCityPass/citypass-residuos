import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import MapPage from './MapPage.jsx';
import { fetchMapContainers, fetchAlerts, fetchZones } from '../api/waste.js';
import { saveToken, clearToken } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchMapContainers: vi.fn(),
  fetchAlerts: vi.fn(),
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
    fetchAlerts.mockResolvedValue([]);

    render(<MapPage tokenVersion={0} />);

    expect(await screen.findByText('3 marcadores')).toBeInTheDocument();
    expect(cardNumber('Critico')).toBe('2');
    expect(cardNumber('Normal')).toBe('1');
  });

  it('cuenta los incendios abiertos aparte del estado del contenedor', async () => {
    fetchMapContainers.mockResolvedValue([container()]);
    fetchAlerts.mockResolvedValue([{ id: 'a-1', contenedorId: 'c-1', tipo: 'INCENDIO' }]);

    render(<MapPage tokenVersion={0} />);

    // El contenedor sigue contando como NORMAL: el incendio no depende del llenado.
    expect(await screen.findByText('1 marcadores')).toBeInTheDocument();
    expect(cardNumber('Normal')).toBe('1');
    expect(cardNumber('Incendios abiertos')).toBe('1');
  });

  it('ante un 401 explica como generar el token en lugar de mostrar el error crudo', async () => {
    fetchMapContainers.mockRejectedValue({ code: 'HTTP_401', message: 'Falta el header' });
    fetchAlerts.mockResolvedValue([]);

    render(<MapPage tokenVersion={0} />);

    expect(await screen.findByText(/npm run token:dev/)).toBeInTheDocument();
  });

  it('carga las zonas para el filtro cuando hay token', async () => {
    saveToken('un-jwt');
    fetchMapContainers.mockResolvedValue([]);
    fetchAlerts.mockResolvedValue([]);

    render(<MapPage tokenVersion={0} />);

    await waitFor(() => expect(fetchZones).toHaveBeenCalled());
    expect(await screen.findByText('Centro (umbral 70%)')).toBeInTheDocument();
  });

  it('no pide las zonas si todavia no cargaste el token', async () => {
    fetchMapContainers.mockResolvedValue([]);
    fetchAlerts.mockResolvedValue([]);

    render(<MapPage tokenVersion={0} />);

    await screen.findByTestId('mapa');
    expect(fetchZones).not.toHaveBeenCalled();
  });
});
