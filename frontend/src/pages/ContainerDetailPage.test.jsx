import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ContainerDetailPage from './ContainerDetailPage.jsx';
import { fetchContainer, fetchAlerts, fetchPrediction } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchContainer: vi.fn(),
  fetchAlerts: vi.fn(),
  fetchPrediction: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
}));

const ZONE = { id: 'zn-1', nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60, bloqueada: false };

const detail = (extras = {}) => ({
  id: 'ct-3',
  codigo: 'CT-0003',
  zonaId: 'zn-1',
  zona: ZONE,
  tipoResiduo: 'ORGANICO',
  capacidadLitros: 1100,
  lat: -34.6068,
  lng: -58.3789,
  estado: 'NORMAL',
  nivelLlenadoPct: 8.2,
  temperaturaC: 91.4,
  ultimaLecturaEn: new Date().toISOString(),
  activo: true,
  sensor: { id: 'sn-3', codigo: 'SN-0003', estado: 'ACTIVO', bateriaPct: 88, ultimoReporteEn: new Date().toISOString() },
  ...extras,
});

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/contenedores/ct-3']}>
      <Routes>
        <Route path="/contenedores/:id" element={<ContainerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('detalle del contenedor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAlerts.mockResolvedValue([]);
    // CU-12 vive dentro de esta pantalla; sin esto la tarjeta queda colgada.
    fetchPrediction.mockResolvedValue({
      contenedorId: 'ct-3',
      nivelActualPct: 8.2,
      tasaLlenadoPctPorHora: 2.4,
      horasHastaUmbral: 25.8,
      saturacionEstimadaEn: new Date(Date.now() + 25.8 * 3600_000).toISOString(),
      confianza: 0.86,
      muestrasUsadas: 96,
    });
  });

  it('muestra el nivel contra el umbral de su zona', async () => {
    fetchContainer.mockResolvedValue(detail());
    mount();

    // "8.2% sobre un umbral de 70" se entiende; "8.2%" solo, no.
    expect(await screen.findByText(/8.2% de llenado · umbral de Centro: 70%/)).toBeInTheDocument();
  });

  /**
   * El incendio se evalua contra la temperatura, no contra el llenado. Este
   * contenedor esta VERDE al 8.2% y a 91.4 C sobre un umbral de 60. El estado
   * de llenado es, en esa pantalla, la informacion menos importante.
   */
  it('destaca el incendio aunque el contenedor este en verde', async () => {
    fetchContainer.mockResolvedValue(detail());
    fetchAlerts.mockResolvedValue([
      {
        id: 'al-1',
        contenedorId: 'ct-3',
        tipo: 'INCENDIO',
        severidad: 'CRITICA',
        estado: 'ABIERTA',
        detalle: 'Temperatura interna 91.4C supera el umbral 60C de la zona Centro',
        detectadaEn: new Date().toISOString(),
        resueltaEn: null,
      },
    ]);
    mount();

    expect(await screen.findByText('Incendio detectado en este contenedor')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('avisa que un contenedor sin sensor nunca va a cambiar de estado', async () => {
    fetchContainer.mockResolvedValue(
      detail({ sensor: null, nivelLlenadoPct: 0, temperaturaC: null, ultimaLecturaEn: null }),
    );
    mount();

    expect(await screen.findByText('Sin sensor vinculado')).toBeInTheDocument();
    expect(screen.getByText(/no significa que esté vacío/)).toBeInTheDocument();
  });

  /**
   * FUERA_DE_SERVICIO existe en el enum y el motor de reglas lo respeta, pero
   * PATCH /contenedores/:id no acepta `estado` y no hay otro endpoint. El boton
   * queda a la vista y apagado en vez de fingir algo que el backend no tiene.
   */
  it('deja el boton de fuera de servicio deshabilitado y explica por que', async () => {
    fetchContainer.mockResolvedValue(detail());
    mount();

    const button = await screen.findByRole('button', { name: 'Poner fuera de servicio' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringContaining('endpoint'));
  });

  it('un 404 no rompe la pantalla, ofrece volver al listado', async () => {
    fetchContainer.mockRejectedValue(
      new ApiError({ code: 'CONTENEDOR_NO_ENCONTRADO', status: 404, message: 'No existe el contenedor ct-3' }),
    );
    mount();

    expect(await screen.findByText('[CONTENEDOR_NO_ENCONTRADO]')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al listado/ })).toBeInTheDocument();
  });
});
