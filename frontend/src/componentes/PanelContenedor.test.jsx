import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PanelContenedor from './PanelContenedor.jsx';
import { obtenerContenedor, obtenerAlertas } from '../api/residuos.js';

vi.mock('../api/residuos.js', () => ({
  obtenerContenedor: vi.fn(),
  obtenerAlertas: vi.fn(),
}));

const ZONA = {
  id: 'z-1',
  nombre: 'Centro',
  umbralCriticoPct: 70,
  umbralTemperaturaC: 60,
  bloqueada: false,
};

const detalle = (extras = {}) => ({
  id: 'c-1',
  codigo: 'CT-0001',
  zonaId: 'z-1',
  zona: ZONA,
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

describe('PanelContenedor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra el nivel contra el umbral de la zona, no el nivel solo', async () => {
    obtenerContenedor.mockResolvedValue(detalle());
    obtenerAlertas.mockResolvedValue([]);

    render(<PanelContenedor contenedorId="c-1" onCerrar={() => {}} />);

    expect(await screen.findByText('CT-0001')).toBeInTheDocument();
    expect(screen.getByText(/94.14% de llenado · umbral de Centro: 70%/)).toBeInTheDocument();
  });

  it('avisa cuando el contenedor no tiene sensor, porque nunca va a cambiar de estado', async () => {
    obtenerContenedor.mockResolvedValue(detalle({ sensor: null }));
    obtenerAlertas.mockResolvedValue([]);

    render(<PanelContenedor contenedorId="c-1" onCerrar={() => {}} />);

    expect(await screen.findByText(/Sin sensor vinculado/)).toBeInTheDocument();
  });

  it('lista las alertas y cuenta solo las que no estan resueltas', async () => {
    obtenerContenedor.mockResolvedValue(detalle());
    obtenerAlertas.mockResolvedValue([
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

    render(<PanelContenedor contenedorId="c-1" onCerrar={() => {}} />);

    expect(await screen.findByText('Alertas (1 sin resolver)')).toBeInTheDocument();
    expect(screen.getByText('INCENDIO')).toBeInTheDocument();
    // El `detalle` viene redactado por el backend y se muestra tal cual.
    expect(screen.getByText(/Temperatura interna 89.76C/)).toBeInTheDocument();
  });

  it('muestra el mensaje del error de la API en lugar de quedar en blanco', async () => {
    obtenerContenedor.mockRejectedValue({ code: 'CONTENEDOR_NO_ENCONTRADO', mensaje: 'No existe' });
    obtenerAlertas.mockResolvedValue([]);

    render(<PanelContenedor contenedorId="c-1" onCerrar={() => {}} />);

    await waitFor(() => expect(screen.getByText('No existe')).toBeInTheDocument());
  });
});
