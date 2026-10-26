import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InterventionsPage from './InterventionsPage.jsx';
import { fetchInterventions } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchInterventions: vi.fn(),
}));

const intervention = (extras = {}) => ({
  id: 'a3f1c2d4-7b5e-4a90-8c11-2e6d9f0b7a15',
  emergenciaId: 'EMG-20261008-0091',
  lat: -34.6045,
  lng: -58.3801,
  contenedorId: 'c1b2c3d4-0000-4000-8000-000000000001',
  distanciaMetros: 12,
  estado: 'PROGRAMADA',
  programadaEn: '2026-10-08T19:05:20.000Z',
  creadaEn: '2026-10-08T19:05:20.000Z',
  ...extras,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <InterventionsPage />
    </MemoryRouter>,
  );

describe('Intervenciones por emergencia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista la emergencia y enlaza al contenedor cercano', async () => {
    fetchInterventions.mockResolvedValue([intervention()]);

    renderPage();

    expect(await screen.findByText('EMG-20261008-0091')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /a 12 m/ });
    expect(link).toHaveAttribute('href', '/contenedores/c1b2c3d4-0000-4000-8000-000000000001');
  });

  it('una intervencion sin contenedor no es un error: se dice "Sin contenedor"', async () => {
    fetchInterventions.mockResolvedValue([
      intervention({ contenedorId: null, distanciaMetros: null }),
    ]);

    renderPage();

    expect(await screen.findByText('Sin contenedor')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('sin intervenciones explica cuando aparecen', async () => {
    fetchInterventions.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/Todavía no hay intervenciones/)).toBeInTheDocument();
  });

  it('si la API falla muestra el codigo del error', async () => {
    fetchInterventions.mockRejectedValue(new ApiError({ code: 'TOKEN_INVALIDO', status: 401, message: 'Token invalido' }));

    renderPage();

    await waitFor(() => expect(screen.getByText('[TOKEN_INVALIDO]')).toBeInTheDocument());
  });
});
