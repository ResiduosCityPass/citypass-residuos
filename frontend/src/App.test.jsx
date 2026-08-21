import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';
import { obtenerContenedoresDelMapa, obtenerAlertas, obtenerZonas } from './api/residuos.js';
import { guardarToken, borrarToken } from './api/cliente.js';

vi.mock('./api/residuos.js', () => ({
  obtenerContenedoresDelMapa: vi.fn(),
  obtenerAlertas: vi.fn(),
  obtenerZonas: vi.fn(),
  obtenerContenedor: vi.fn(),
}));

// Leaflet necesita un contenedor con tamano real, que jsdom no tiene. La pantalla
// se prueba con el mapa reemplazado por un stub; el mapa en si se verifica a mano.
vi.mock('./componentes/MapaContenedores.jsx', () => ({
  default: ({ contenedores }) => <div data-testid="mapa">{contenedores.length} marcadores</div>,
}));

const contenedor = (extras = {}) => ({
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

describe('pantalla del mapa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    borrarToken();
    obtenerZonas.mockResolvedValue([{ id: 'z-1', nombre: 'Centro', umbralCriticoPct: 70 }]);
  });

  it('resume cuantos contenedores hay en cada estado', async () => {
    obtenerContenedoresDelMapa.mockResolvedValue([
      contenedor(),
      contenedor({ id: 'c-2', estado: 'CRITICO' }),
      contenedor({ id: 'c-3', estado: 'CRITICO' }),
    ]);
    obtenerAlertas.mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText('3 marcadores')).toBeInTheDocument();
    expect(screen.getByText(/Critico \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Normal \(1\)/)).toBeInTheDocument();
  });

  it('cuenta los incendios abiertos aparte del estado del contenedor', async () => {
    obtenerContenedoresDelMapa.mockResolvedValue([contenedor()]);
    obtenerAlertas.mockResolvedValue([{ id: 'a-1', contenedorId: 'c-1', tipo: 'INCENDIO' }]);

    render(<App />);

    // El contenedor sigue contando como NORMAL: el incendio no depende del llenado.
    expect(await screen.findByText(/Normal \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Incendio abierto \(1\)/)).toBeInTheDocument();
  });

  it('ante un 401 explica como generar el token en lugar de mostrar el error crudo', async () => {
    obtenerContenedoresDelMapa.mockRejectedValue({ code: 'HTTP_401', mensaje: 'Falta el header' });
    obtenerAlertas.mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText(/npm run token:dev/)).toBeInTheDocument();
  });

  it('carga las zonas para el filtro cuando hay token', async () => {
    guardarToken('un-jwt');
    obtenerContenedoresDelMapa.mockResolvedValue([]);
    obtenerAlertas.mockResolvedValue([]);

    render(<App />);

    await waitFor(() => expect(obtenerZonas).toHaveBeenCalled());
    expect(await screen.findByText('Centro (umbral 70%)')).toBeInTheDocument();
  });

  it('no pide las zonas si todavia no cargaste el token', async () => {
    obtenerContenedoresDelMapa.mockResolvedValue([]);
    obtenerAlertas.mockResolvedValue([]);

    render(<App />);

    await screen.findByTestId('mapa');
    expect(obtenerZonas).not.toHaveBeenCalled();
  });
});
