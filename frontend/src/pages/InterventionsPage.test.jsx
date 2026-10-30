import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InterventionsPage from './InterventionsPage.jsx';
import { fetchInterventions, completeIntervention } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchInterventions: vi.fn(),
  completeIntervention: vi.fn(),
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

  it('las tarjetas cuentan con refuerzo, sin contenedor y completadas', async () => {
    fetchInterventions.mockResolvedValue([
      intervention({ id: 'a' }),
      intervention({ id: 'b', contenedorId: null, distanciaMetros: null }),
      intervention({ id: 'c', estado: 'COMPLETADA', completadaEn: '2026-10-08T21:00:00.000Z' }),
    ]);

    renderPage();

    const cards = await screen.findByLabelText('Resumen de intervenciones');
    const value = (label) =>
      [...cards.children]
        .find((card) => card.textContent.includes(label))
        .querySelector('.card-number').textContent;
    expect(value('Intervenciones')).toBe('3');
    expect(value('Con refuerzo')).toBe('2');
    expect(value('Sin contenedor cerca')).toBe('1');
    expect(value('Completadas')).toBe('1');
  });

  it('marcar completada llama a la API y recarga', async () => {
    fetchInterventions.mockResolvedValueOnce([intervention()]);
    completeIntervention.mockResolvedValue({});
    fetchInterventions.mockResolvedValueOnce([
      intervention({ estado: 'COMPLETADA', completadaEn: '2026-10-08T21:00:00.000Z' }),
    ]);

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar completada' }));

    expect(completeIntervention).toHaveBeenCalledWith('a3f1c2d4-7b5e-4a90-8c11-2e6d9f0b7a15');
    expect(await screen.findByText(/quedó completada/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Marcar completada' })).not.toBeInTheDocument(),
    );
  });

  it('una intervencion completada no ofrece el boton', async () => {
    fetchInterventions.mockResolvedValue([intervention({ estado: 'COMPLETADA' })]);

    renderPage();

    await screen.findByText('Completada');
    expect(screen.queryByRole('button', { name: 'Marcar completada' })).not.toBeInTheDocument();
  });

  it('si completar falla muestra el codigo y no pierde la lista', async () => {
    fetchInterventions.mockResolvedValue([intervention()]);
    completeIntervention.mockRejectedValue(
      new ApiError({ code: 'INTERVENCION_YA_COMPLETADA', status: 409, message: 'Ya estaba' }),
    );

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar completada' }));

    expect(await screen.findByText('[INTERVENCION_YA_COMPLETADA]')).toBeInTheDocument();
    expect(screen.getByText('EMG-20261008-0091')).toBeInTheDocument();
  });
});
