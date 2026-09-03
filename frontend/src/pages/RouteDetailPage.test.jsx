import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RouteDetailPage from './RouteDetailPage.jsx';
import { fetchRoute, assignRoute } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchRoute: vi.fn(),
  assignRoute: vi.fn(),
}));

// Leaflet necesita un contenedor con tamano real, que jsdom no tiene.
vi.mock('../components/routes/RouteMap.jsx', () => ({
  default: ({ stops }) => <div data-testid="mapa-ruta">{stops.length} paradas</div>,
}));

const container = (id, code, extras = {}) => ({
  id, codigo: code, lat: -34.6, lng: -58.38,
  estado: 'CRITICO', tipoResiduo: 'COMUN', capacidadLitros: 1000,
  nivelLlenadoPct: 90, ...extras,
});

const route = (extras = {}) => ({
  id: 'rt-9',
  camionId: 'cm-1',
  choferId: null,
  estado: 'PROPUESTA',
  distanciaEstimadaKm: 7.4,
  generadaEn: new Date().toISOString(),
  asignadaEn: null,
  camion: { id: 'cm-1', patente: 'AB123CD', capacidadLitros: 4000, tipoResiduoHabilitado: 'COMUN' },
  // La ruta NO trae un objeto `chofer`: los choferes son usuarios del Squad 2 y
  // este modulo no guarda copia de sus datos. Solo viaja `choferId`.
  paradas: [
    { id: 'pd-1', orden: 1, estado: 'PENDIENTE', confirmadaEn: null, contenedor: container('ct-1', 'CT-0001') },
    { id: 'pd-2', orden: 2, estado: 'PENDIENTE', confirmadaEn: null, contenedor: container('ct-2', 'CT-0002') },
  ],
  ...extras,
});

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/rutas/rt-9']}>
      <Routes>
        <Route path="/rutas/:id" element={<RouteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CU-08 / CU-09 · revisar y asignar una ruta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('una propuesta avisa que todavia no la ve ningun chofer', async () => {
    fetchRoute.mockResolvedValue(route());
    mount();

    expect(await screen.findByText('Esta ruta es una propuesta')).toBeInTheDocument();
    // Sin identificador escrito no se puede confirmar: no hay lista de choferes
    // de la que preseleccionar uno, y asignar a nadie no significa nada.
    expect(screen.getByRole('button', { name: 'Confirmar y asignar' })).toBeDisabled();
  });

  /**
   * La carga es el limite duro de la heuristica. Dos contenedores de 1000 L al
   * 90% son 1800 L sobre un camion de 4000: 45%. Verlo evita mandar el camion
   * medio vacio sin darse cuenta.
   */
  it('muestra cuanto se llena el camion con las paradas propuestas', async () => {
    fetchRoute.mockResolvedValue(route());
    mount();

    expect(await screen.findByText(/1.800 L de 4.000 L · 45% del camión/)).toBeInTheDocument();
  });

  it('lista las paradas en orden', async () => {
    fetchRoute.mockResolvedValue(route());
    mount();

    await screen.findByText('CT-0001');
    const orders = [...document.querySelectorAll('.stop-order-badge')].map((n) => n.textContent);
    expect(orders).toEqual(['1', '2']);
  });

  /**
   * Generar y asignar estan separados a proposito. Una ruta ya asignada no
   * vuelve a ofrecer el boton: la decision ya la tomo alguien.
   */
  it('una ruta ya asignada no se puede volver a asignar', async () => {
    fetchRoute.mockResolvedValue(
      route({ estado: 'ASIGNADA', choferId: 'ldap:jperez', asignadaEn: new Date().toISOString() }),
    );
    mount();

    // Se muestra el identificador y nada mas: no tenemos el nombre del chofer.
    expect(await screen.findByText('ldap:jperez')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar y asignar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Esta ruta es una propuesta')).not.toBeInTheDocument();
  });

  it('asignar manda el identificador escrito a mano', async () => {
    const user = userEvent.setup();
    fetchRoute.mockResolvedValue(route());
    assignRoute.mockResolvedValue(route({ estado: 'ASIGNADA' }));
    mount();

    await user.type(await screen.findByLabelText(/Asignar a/), 'ldap:jperez');
    await user.click(screen.getByRole('button', { name: 'Confirmar y asignar' }));

    await waitFor(() => expect(assignRoute).toHaveBeenCalledWith('rt-9', { choferId: 'ldap:jperez' }));
  });

  it('si la ruta dejo de ser propuesta lo dice con el codigo del backend', async () => {
    const user = userEvent.setup();
    fetchRoute.mockResolvedValue(route());
    assignRoute.mockRejectedValue(
      new ApiError({ code: 'RUTA_NO_PROPUESTA', status: 409, message: 'La ruta ya esta en estado ASIGNADA' }),
    );
    mount();

    await user.type(await screen.findByLabelText(/Asignar a/), 'ldap:jperez');
    await user.click(screen.getByRole('button', { name: 'Confirmar y asignar' }));

    expect(await screen.findByText('[RUTA_NO_PROPUESTA]')).toBeInTheDocument();
  });

  /**
   * No hay GET /choferes y el backend no valida el id contra ningun padron: un
   * identificador mal tipeado asigna la ruta igual y el chofer no la ve nunca.
   * La pantalla tiene que decirlo, no disimularlo con un <select> inventado.
   */
  it('avisa que el identificador del chofer se escribe a mano', async () => {
    fetchRoute.mockResolvedValue(route());
    mount();

    expect(await screen.findByText('El identificador se escribe a mano')).toBeInTheDocument();
  });
});
