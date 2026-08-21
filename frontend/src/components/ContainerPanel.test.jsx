import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ContainerPanel from './ContainerPanel.jsx';
import { fetchContainer, fetchAlerts } from '../api/waste.js';

vi.mock('../api/waste.js', () => ({
  fetchContainer: vi.fn(),
  fetchAlerts: vi.fn(),
}));

const ZONE = {
  id: 'z-1',
  nombre: 'Centro',
  umbralCriticoPct: 70,
  umbralTemperaturaC: 60,
  bloqueada: false,
};

const detail = (extras = {}) => ({
  id: 'c-1',
  codigo: 'CT-0001',
  zonaId: 'z-1',
  zona: ZONE,
  tipoResiduo: 'COMUN',
  capacidadLitros: 1100,
  estado: 'CRITICO',
  nivelLlenadoPct: 94.14,
  temperaturaC: 20.61,
  ultimaLecturaEn: '2026-08-20T22:50:02.199Z',
  activo: true,
  sensor: {
    id: 's-1',
    codigo: 'SN-0001',
    estado: 'ACTIVO',
    bateriaPct: 99,
  },
  ...extras,
});

describe('ContainerPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra el nivel contra el umbral de la zona, no el nivel solo', async () => {
    fetchContainer.mockResolvedValue(detail());
    fetchAlerts.mockResolvedValue([]);

    render(<ContainerPanel containerId="c-1" onClose={() => {}} />);

    expect(await screen.findByText('CT-0001')).toBeInTheDocument();
    expect(screen.getByText(/94.14% de llenado · umbral de Centro: 70%/)).toBeInTheDocument();
  });

  it('avisa cuando el contenedor no tiene sensor, porque nunca va a cambiar de estado', async () => {
    fetchContainer.mockResolvedValue(detail({ sensor: null }));
    fetchAlerts.mockResolvedValue([]);

    render(<ContainerPanel containerId="c-1" onClose={() => {}} />);

    expect(await screen.findByText(/Sin sensor vinculado/)).toBeInTheDocument();
  });

  it('lista las alertas y cuenta solo las que no estan resueltas', async () => {
    fetchContainer.mockResolvedValue(detail());
    fetchAlerts.mockResolvedValue([
      {
        id: 'a-1',
        tipo: 'INCENDIO',
        severidad: 'CRITICA',
        estado: 'ABIERTA',
        detalle: 'Temperatura interna 89.76C supera el umbral 60C',
        detectadaEn: '2026-08-20T22:50:00.000Z',
      },
      {
        id: 'a-2',
        tipo: 'SATURACION',
        severidad: 'MEDIA',
        estado: 'RESUELTA',
        detalle: 'Nivel 76% supera el umbral 70%',
        detectadaEn: '2026-08-20T21:00:00.000Z',
      },
    ]);

    render(<ContainerPanel containerId="c-1" onClose={() => {}} />);

    expect(await screen.findByText('Alertas (1 sin resolver)')).toBeInTheDocument();
    expect(screen.getByText('INCENDIO')).toBeInTheDocument();
    // El `detalle` viene redactado por el backend y se muestra tal cual.
    expect(screen.getByText(/Temperatura interna 89.76C/)).toBeInTheDocument();
  });

  it('muestra el mensaje del error de la API en lugar de quedar en blanco', async () => {
    fetchContainer.mockRejectedValue({ code: 'CONTENEDOR_NO_ENCONTRADO', message: 'No existe' });
    fetchAlerts.mockResolvedValue([]);

    render(<ContainerPanel containerId="c-1" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('No existe')).toBeInTheDocument());
  });
});
