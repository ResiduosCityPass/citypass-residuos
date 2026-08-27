import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PredictionCard from './PredictionCard.jsx';
import { fetchPrediction } from '../../api/waste.js';
import { ApiError } from '../../api/client.js';

vi.mock('../../api/waste.js', () => ({ fetchPrediction: vi.fn() }));

const prediction = (extras = {}) => ({
  contenedorId: 'ct-1',
  nivelActualPct: 62.3,
  tasaLlenadoPctPorHora: 3.1,
  horasHastaUmbral: 2.5,
  saturacionEstimadaEn: new Date(Date.now() + 2.5 * 3600_000).toISOString(),
  confianza: 0.87,
  muestrasUsadas: 96,
  ...extras,
});

describe('CU-12 · tarjeta de prediccion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra cuanto falta para el umbral y con cuanta confianza', async () => {
    fetchPrediction.mockResolvedValue(prediction());

    render(<PredictionCard containerId="ct-1" thresholdPct={70} />);

    expect(await screen.findByText('en 2,5 h')).toBeInTheDocument();
    expect(screen.getByText('confianza alta')).toBeInTheDocument();
    expect(screen.getByText('3.1% por hora')).toBeInTheDocument();
  });

  /**
   * El punto entero de mostrar la confianza al lado del numero: una estimacion
   * con R² 0.31 se ve igual de segura que una con 0.93 si solo se muestra "se
   * satura en 2,5 h", y sobre eso alguien planifica un camion.
   */
  it('avisa cuando la confianza es demasiado baja para planificar', async () => {
    fetchPrediction.mockResolvedValue(prediction({ confianza: 0.31, muestrasUsadas: 22 }));

    render(<PredictionCard containerId="ct-1" thresholdPct={70} />);

    expect(await screen.findByText('No planifiques con este número')).toBeInTheDocument();
    expect(screen.getByText('confianza baja')).toBeInTheDocument();
  });

  it('con buena confianza no mete el cartel de advertencia', async () => {
    fetchPrediction.mockResolvedValue(prediction());

    render(<PredictionCard containerId="ct-1" thresholdPct={70} />);

    await screen.findByText('en 2,5 h');
    expect(screen.queryByText('No planifiques con este número')).not.toBeInTheDocument();
  });

  it('si el umbral ya se cruzo no promete un futuro', async () => {
    fetchPrediction.mockResolvedValue(prediction({ nivelActualPct: 94, horasHastaUmbral: 0 }));

    render(<PredictionCard containerId="ct-1" thresholdPct={70} />);

    expect(await screen.findByText('Umbral superado')).toBeInTheDocument();
  });

  it('sin lecturas lo explica en vez de mostrar un error crudo', async () => {
    fetchPrediction.mockRejectedValue(
      new ApiError({
        code: 'SIN_LECTURAS_SUFICIENTES',
        status: 409,
        message: 'El contenedor CT-0006 todavia no reporto ninguna lectura',
      }),
    );

    render(<PredictionCard containerId="ct-6" thresholdPct={70} />);

    expect(await screen.findByText('Todavía no se puede predecir')).toBeInTheDocument();
    expect(screen.getByText(/en cuanto el contenedor empiece a reportar/i)).toBeInTheDocument();
  });
});
