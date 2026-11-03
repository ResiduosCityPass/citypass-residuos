import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MetricsPage, { LOAD_TIMEOUT_MS } from './MetricsPage.jsx';

const URL_DASHBOARD = 'https://bi.citypass.test/residuos';

const frame = () => screen.getByTitle('Dashboard de métricas de Residuos');
const expire = () => act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS); });

describe('Metricas · dashboard de Analitica', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin URL configurada avisa que falta conectarlo y no monta el iframe', () => {
    render(<MetricsPage dashboardUrl="" />);

    expect(screen.getByText('El dashboard todavía no está conectado')).toBeInTheDocument();
    expect(screen.queryByTitle('Dashboard de métricas de Residuos')).not.toBeInTheDocument();
  });

  it('muestra el estado de carga mientras el dashboard no termina de cargar', () => {
    render(<MetricsPage dashboardUrl={URL_DASHBOARD} />);

    expect(frame()).toHaveAttribute('src', URL_DASHBOARD);
    expect(screen.getByText('Cargando el dashboard…')).toBeInTheDocument();
  });

  it('saca el estado de carga cuando el dashboard carga', () => {
    render(<MetricsPage dashboardUrl={URL_DASHBOARD} />);

    fireEvent.load(frame());

    expect(screen.queryByText('Cargando el dashboard…')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa que no responde si se vence el plazo', () => {
    render(<MetricsPage dashboardUrl={URL_DASHBOARD} />);

    expire();

    expect(screen.getByRole('alert')).toHaveTextContent('El dashboard no responde');
    expect(screen.queryByText('Cargando el dashboard…')).not.toBeInTheDocument();
  });

  /** Si ya cargo, el timeout no puede pisarlo con un error falso. */
  it('no marca error si el dashboard cargo antes del plazo', () => {
    render(<MetricsPage dashboardUrl={URL_DASHBOARD} />);

    fireEvent.load(frame());
    expire();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('se recupera sola si el dashboard contesta despues del plazo', () => {
    render(<MetricsPage dashboardUrl={URL_DASHBOARD} />);
    expire();

    fireEvent.load(frame());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reintentar monta un iframe nuevo y le da otro plazo', () => {
    render(<MetricsPage dashboardUrl={URL_DASHBOARD} />);
    expire();
    const failed = frame();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(frame()).not.toBe(failed);
    expect(screen.getByText('Cargando el dashboard…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    expire();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  /** Un sitio que prohibe que lo embeban no se detecta: el enlace es la salida. */
  it('siempre ofrece abrir el dashboard en otra pestaña', () => {
    render(<MetricsPage dashboardUrl={URL_DASHBOARD} />);

    const link = screen.getByRole('link', { name: 'Abrir en otra pestaña' });
    expect(link).toHaveAttribute('href', URL_DASHBOARD);
    expect(link).toHaveAttribute('target', '_blank');
  });
});
