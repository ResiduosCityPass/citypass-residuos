import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MetricsPage from './MetricsPage.jsx';
import { fetchAnalyticsDashboard } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({ fetchAnalyticsDashboard: vi.fn() }));

const HTML = '<!doctype html><html><body>Tablero</body></html>';
const frame = () => screen.findByTitle('Dashboard de métricas de Residuos');

describe('Metricas · dashboard de Analitica', () => {
  beforeEach(() => {
    fetchAnalyticsDashboard.mockReset();
  });

  it('muestra el estado de carga mientras el backend trae el tablero', () => {
    fetchAnalyticsDashboard.mockReturnValue(new Promise(() => {}));

    render(<MetricsPage />);

    expect(screen.getByText('Cargando el dashboard…')).toBeInTheDocument();
  });

  it('muestra el HTML de Analitica en un iframe aislado', async () => {
    fetchAnalyticsDashboard.mockResolvedValue({ html: HTML });

    render(<MetricsPage />);

    const iframe = await frame();
    expect(iframe).toHaveAttribute('srcdoc', HTML);
    // Sin allow-same-origin: el tablero no puede leer la sesion de la app.
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    expect(screen.queryByText('Cargando el dashboard…')).not.toBeInTheDocument();
  });

  it('sin la conexion configurada avisa que falta conectarlo', async () => {
    fetchAnalyticsDashboard.mockRejectedValue(
      new ApiError({ code: 'ANALITICA_NO_CONFIGURADA', status: 503, message: 'x' }),
    );

    render(<MetricsPage />);

    expect(await screen.findByText('El dashboard todavía no está conectado')).toBeInTheDocument();
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });

  it('si Analitica rechaza, muestra su motivo y permite reintentar', async () => {
    fetchAnalyticsDashboard
      .mockRejectedValueOnce(
        new ApiError({
          code: 'ANALITICA_RECHAZO',
          status: 502,
          message: 'Analítica respondió 401: Token inválido o expirado.',
        }),
      )
      .mockResolvedValueOnce({ html: HTML });

    render(<MetricsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Token inválido o expirado');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await frame()).toHaveAttribute('srcdoc', HTML);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a un operador le explica que el tablero es solo para el admin', async () => {
    fetchAnalyticsDashboard.mockRejectedValue(
      new ApiError({ code: 'HTTP_403', status: 403, message: 'Forbidden' }),
    );

    render(<MetricsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo un administrador puede ver el tablero de Analítica.',
    );
  });

  it('ajusta la altura cuando el tablero la avisa, pero solo si viene de su iframe', async () => {
    fetchAnalyticsDashboard.mockResolvedValue({ html: HTML });
    render(<MetricsPage />);
    const iframe = await frame();
    const contenedor = iframe.parentElement;

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { tipo: 'citypass-tablero-altura', altura: 1800 } }),
      );
    });
    expect(contenedor.style.height).toBe('');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { tipo: 'citypass-tablero-altura', altura: 1800 },
          source: iframe.contentWindow,
        }),
      );
    });
    expect(contenedor.style.height).toBe('1800px');
  });
});
