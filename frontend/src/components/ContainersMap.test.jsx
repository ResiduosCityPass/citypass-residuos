import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContainersMap from './ContainersMap.jsx';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  CircleMarker: ({ pathOptions, children, eventHandlers }) => <div data-testid={children ? 'container-marker' : 'halo'} data-fill={pathOptions.fillColor} data-dash={pathOptions.dashArray} onClick={eventHandlers?.click}>{children}</div>,
  Tooltip: ({ children }) => <div>{children}</div>,
}));
vi.mock('./map/BaseTiles.jsx', () => ({ default: () => null }));

describe('Mapa: suspension independiente del llenado', () => {
  it('muestra el borde de inundacion y conserva el color del contenedor critico', () => {
    render(<ContainersMap containers={[{ id: 'c1', codigo: 'CT-0001', lat: -34.6, lng: -58.38, estado: 'CRITICO', nivelLlenadoPct: 90, ultimaLecturaEn: '2026-10-19', recoleccionSuspendida: true }]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('halo')).toHaveAttribute('data-dash', '4 4');
    expect(screen.getByTestId('container-marker')).toHaveAttribute('data-fill', '#C83E4D');
    expect(screen.getByText('Recolección suspendida por inundación')).toBeInTheDocument();
  });
  it('puede mostrar incendio e inundacion simultaneamente', () => {
    render(<ContainersMap containers={[{ id: 'c1', codigo: 'CT-0001', lat: -34.6, lng: -58.38, estado: 'NORMAL', nivelLlenadoPct: 8, ultimaLecturaEn: null, incendioActivo: true, recoleccionSuspendida: true }]} onSelect={vi.fn()} />);
    expect(screen.getAllByTestId('halo')).toHaveLength(2);
    expect(screen.getByTestId('container-marker')).toHaveAttribute('data-fill', '#4F8A72');
  });
});
