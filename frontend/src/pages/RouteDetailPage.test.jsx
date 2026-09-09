import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RouteDetailPage from './RouteDetailPage.jsx';
import { fetchRoute, fetchDrivers, assignRoute } from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchRoute: vi.fn(),
  fetchDrivers: vi.fn(),
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
  // La ruta trae el `chofer` expandido junto al `choferId` (ADR-009). En una
  // propuesta los dos son null: todavia no se la asigno nadie.
  chofer: null,
  paradas: [
    { id: 'pd-1', orden: 1, estado: 'PENDIENTE', confirmadaEn: null, omitidaEn: null, motivo: null, contenedor: container('ct-1', 'CT-0001') },
    { id: 'pd-2', orden: 2, estado: 'PENDIENTE', confirmadaEn: null, omitidaEn: null, motivo: null, contenedor: container('ct-2', 'CT-0002') },
  ],
  ...extras,
});

/**
 * `usuarioSub` es lo unico que une al chofer con su sesion, y es OPCIONAL: por
 * eso el fixture tiene uno sin el. A esa persona se le puede asignar una ruta
 * igual, pero no la ve — es la unica falla de esta pantalla que no produce
 * ningun error, asi que tiene que avisarla la pantalla.
 */
const JUANA = {
  id: '8f2c1d4e-6b3a-4f21-9c07-5d2e1a9b4c33',
  nombre: 'Juana Perez', legajo: 'CH-001', usuarioSub: 'dev-chofer', activo: true,
};
const SIN_ACCESO = {
  id: 'c4a9f0b6-2d81-4c37-b5e2-9f13a7d6e480',
  nombre: 'Rocio Ledesma', legajo: 'CH-003', usuarioSub: null, activo: true,
};

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
    // `GET /choferes` trae solo los activos: son los unicos a los que se les
    // puede asignar una ruta.
    fetchDrivers.mockResolvedValue([JUANA, SIN_ACCESO]);
  });

  /**
   * El motivo se le pide al chofer como obligatorio. Este es el unico lugar
   * donde el operador lo lee, y de aca sale la decision de si vuelve a rutear
   * ese contenedor hoy. Si no se mostrara, pedirlo no serviria para nada.
   */
  it('una parada omitida muestra por que no se pudo vaciar', async () => {
    fetchRoute.mockResolvedValue(
      route({
        estado: 'COMPLETADA',
        paradas: [
          {
            id: 'pd-1',
            orden: 1,
            estado: 'OMITIDA',
            confirmadaEn: null,
            omitidaEn: new Date().toISOString(),
            motivo: 'Calle cortada por obra',
            contenedor: container('ct-1', 'CT-0001'),
          },
        ],
      }),
    );
    mount();

    expect(await screen.findByText(/No se pudo vaciar: Calle cortada por obra/)).toBeInTheDocument();
    // El contenedor sigue en CRITICO al 90%: omitir no vacia nada.
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('una propuesta avisa que todavia no la ve ningun chofer', async () => {
    fetchRoute.mockResolvedValue(route());
    mount();

    expect(await screen.findByText('Esta ruta es una propuesta')).toBeInTheDocument();
    // Sin chofer elegido no se puede confirmar. El selector arranca en la
    // opcion vacia a proposito: preseleccionar al primero de la lista hace que
    // se asignen rutas al que salio primero en el ORDER BY.
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
      route({
        estado: 'ASIGNADA',
        choferId: JUANA.id,
        chofer: JUANA,
        asignadaEn: new Date().toISOString(),
      }),
    );
    mount();

    // El nombre, no el uuid. El legajo va ademas del nombre: es lo que
    // distingue a dos personas que se llaman igual.
    expect(await screen.findByText('Juana Perez')).toBeInTheDocument();
    expect(screen.getByText('CH-001')).toBeInTheDocument();
    expect(screen.queryByText(JUANA.id)).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Confirmar y asignar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Esta ruta es una propuesta')).not.toBeInTheDocument();
  });

  /**
   * El selector se llena con `GET /choferes`, que trae solo los activos. Que la
   * pantalla no ofrezca a un inactivo es la mitad del arreglo: la otra mitad es
   * el 409 del backend, por si alguien lo dan de baja con la pantalla abierta.
   */
  it('el selector se llena con los choferes activos', async () => {
    fetchRoute.mockResolvedValue(route());
    mount();

    expect(await screen.findByRole('option', { name: /Juana Perez · CH-001/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Rocio Ledesma · CH-003/ })).toBeInTheDocument();
  });

  /**
   * Lo que este cambio vino a arreglar: antes viajaba un string escrito a mano
   * que el backend aceptaba sin validar. Ahora viaja el uuid de alguien que
   * existe, y el test falla si alguien vuelve a poner un input de texto.
   */
  it('asignar manda el uuid del chofer elegido', async () => {
    const user = userEvent.setup();
    fetchRoute.mockResolvedValue(route());
    assignRoute.mockResolvedValue(route({ estado: 'ASIGNADA', choferId: JUANA.id, chofer: JUANA }));
    mount();

    await screen.findByRole('option', { name: /Juana Perez/ });
    await user.selectOptions(screen.getByLabelText(/Asignar a/), JUANA.id);
    await user.click(screen.getByRole('button', { name: 'Confirmar y asignar' }));

    await waitFor(() => expect(assignRoute).toHaveBeenCalledWith('rt-9', { choferId: JUANA.id }));
  });

  /**
   * La unica falla que queda sin error del backend: la asignacion sale bien y
   * el chofer no ve nada. Se avisa ANTES de confirmar, que es el unico momento
   * en que el operador todavia puede elegir a otro.
   */
  it('avisa si el chofer elegido no tiene acceso configurado', async () => {
    const user = userEvent.setup();
    fetchRoute.mockResolvedValue(route());
    mount();

    await screen.findByRole('option', { name: /Rocio Ledesma/ });
    await user.selectOptions(screen.getByLabelText(/Asignar a/), SIN_ACCESO.id);
    expect(await screen.findByText('Rocio Ledesma todavía no tiene acceso')).toBeInTheDocument();

    // Se avisa, no se prohibe: la ruta queda a su nombre igual, que es lo que
    // el operador puede querer mientras alguien le emite la credencial.
    expect(screen.getByRole('button', { name: 'Confirmar y asignar' })).toBeEnabled();

    // Y el que sí tiene acceso no arrastra el cartel del anterior.
    await user.selectOptions(screen.getByLabelText(/Asignar a/), JUANA.id);
    await waitFor(() =>
      expect(screen.queryByText('Rocio Ledesma todavía no tiene acceso')).not.toBeInTheDocument(),
    );
  });

  it('si la ruta dejo de ser propuesta lo dice con el codigo del backend', async () => {
    const user = userEvent.setup();
    fetchRoute.mockResolvedValue(route());
    assignRoute.mockRejectedValue(
      new ApiError({ code: 'RUTA_NO_PROPUESTA', status: 409, message: 'La ruta ya esta en estado ASIGNADA' }),
    );
    mount();

    await screen.findByRole('option', { name: /Juana Perez/ });
    await user.selectOptions(screen.getByLabelText(/Asignar a/), JUANA.id);
    await user.click(screen.getByRole('button', { name: 'Confirmar y asignar' }));

    expect(await screen.findByText('[RUTA_NO_PROPUESTA]')).toBeInTheDocument();
  });

  /**
   * Dar de baja a un chofer con la pantalla abierta: la lista que se cargo hace
   * un rato todavia lo ofrece. El 409 es la red que ataja eso, y tiene que
   * llegar a la pantalla como los demas codigos del backend.
   */
  it('un chofer dado de baja mientras tanto llega como CHOFER_INACTIVO', async () => {
    const user = userEvent.setup();
    fetchRoute.mockResolvedValue(route());
    assignRoute.mockRejectedValue(
      new ApiError({
        code: 'CHOFER_INACTIVO',
        status: 409,
        message: 'Juana Perez esta dada de baja y no recibe rutas nuevas',
      }),
    );
    mount();

    await screen.findByRole('option', { name: /Juana Perez/ });
    await user.selectOptions(screen.getByLabelText(/Asignar a/), JUANA.id);
    await user.click(screen.getByRole('button', { name: 'Confirmar y asignar' }));

    expect(await screen.findByText('[CHOFER_INACTIVO]')).toBeInTheDocument();
    expect(
      screen.getByText(/no recibe rutas nuevas/),
    ).toBeInTheDocument();
  });

  /**
   * Que el listado de choferes falle NO puede llevarse puesta la pantalla: la
   * ruta ya se cargo y mirarla es la mitad de este caso de uso. Se cargan por
   * separado justamente por esto.
   */
  it('si falla el listado de choferes la ruta se sigue viendo', async () => {
    fetchRoute.mockResolvedValue(route());
    fetchDrivers.mockRejectedValue(
      new ApiError({ code: 'HTTP_403', status: 403, message: 'Rol insuficiente' }),
    );
    mount();

    expect(await screen.findByText('CT-0001')).toBeInTheDocument();
    expect(await screen.findByText(/No se pudo traer la lista de choferes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar y asignar' })).toBeDisabled();
  });
});
