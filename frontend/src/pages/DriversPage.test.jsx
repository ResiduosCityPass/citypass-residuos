import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DriversPage from './DriversPage.jsx';
import {
  fetchDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
  reactivateDriver,
  issueDriverCredential,
  fetchRoutes,
} from '../api/waste.js';
import { ApiError } from '../api/client.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchDrivers: vi.fn(),
  createDriver: vi.fn(),
  updateDriver: vi.fn(),
  deleteDriver: vi.fn(),
  reactivateDriver: vi.fn(),
  issueDriverCredential: vi.fn(),
  fetchRoutes: vi.fn(),
}));

const JUANA_ID = '8f2c1d4e-6b3a-4f21-9c07-5d2e1a9b4c33';

const driver = (extras = {}) => ({
  id: JUANA_ID,
  nombre: 'Juana Perez',
  legajo: 'CH-001',
  usuarioSub: 'chofer_3f9a',
  activo: true,
  creadoEn: '2026-09-01T12:00:00.000Z',
  actualizadoEn: '2026-09-01T12:00:00.000Z',
  ...extras,
});

const rocio = driver({
  id: 'c4a9f0b6-2d81-4c37-b5e2-9f13a7d6e480',
  nombre: 'Rocio Ledesma',
  legajo: 'CH-003',
  usuarioSub: null,
});

const rowFor = (name) => within(screen.getByText(name).closest('tr'));
const dialog = () => within(screen.getByRole('dialog'));

describe('CU-09 · choferes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDrivers.mockResolvedValue([driver(), rocio]);
    fetchRoutes.mockResolvedValue([]);
  });

  /**
   * La columna que justifica la pantalla. Un chofer sin `usuarioSub` recibe
   * rutas y no las ve, sin ningun error en ningun lado.
   */
  it('dice quien tiene acceso a su pantalla y quien no', async () => {
    render(<DriversPage />);

    expect(await screen.findByText('Juana Perez')).toBeInTheDocument();
    expect(rowFor('Juana Perez').getByText('Con acceso')).toBeInTheDocument();
    expect(rowFor('Rocio Ledesma').getByText('Sin acceso')).toBeInTheDocument();
    expect(screen.getByText(/Hoy 1 de 2 activos tienen acceso/)).toBeInTheDocument();
  });

  it('no muestra el usuarioSub: es un identificador opaco que no le dice nada a nadie', async () => {
    render(<DriversPage />);

    await screen.findByText('Juana Perez');
    expect(screen.queryByText('chofer_3f9a')).not.toBeInTheDocument();
  });

  it('por defecto no pide los dados de baja, y tildando los ofrece reactivar y nada mas', async () => {
    const user = userEvent.setup();
    render(<DriversPage />);

    await screen.findByText('Juana Perez');
    expect(fetchDrivers).toHaveBeenCalledWith({});

    fetchDrivers.mockResolvedValue([
      driver(),
      driver({ id: 'd7b3e5c1-9a24-4f60-8d19-3e0c6b8a2f55', nombre: 'Hector Villalba', legajo: 'CH-004', activo: false }),
    ]);
    await user.click(screen.getByLabelText('Mostrar dados de baja'));

    await waitFor(() => expect(fetchDrivers).toHaveBeenLastCalledWith({ incluirInactivos: true }));
    expect(await screen.findByText('Hector Villalba')).toBeInTheDocument();
    expect(rowFor('Hector Villalba').getByText('Dado de baja')).toBeInTheDocument();
    // Editar o emitirle la credencial le sacaria un 409 CHOFER_INACTIVO: la
    // unica accion que tiene sentido ofrecerle es volver.
    const acciones = rowFor('Hector Villalba').getAllByRole('button');
    expect(acciones).toHaveLength(1);
    expect(acciones[0]).toHaveAccessibleName('Reactivar');
  });

  /**
   * Deshacer la baja. Sin esto un clic equivocado era permanente: el chofer no
   * volvia y, como el legajo cuenta tambien a los dados de baja, tampoco se lo
   * podia dar de alta de nuevo.
   */
  it('reactivar deshace la baja y avisa que vuelve con la credencial que tenia', async () => {
    const user = userEvent.setup();
    const hector = driver({
      id: 'd7b3e5c1-9a24-4f60-8d19-3e0c6b8a2f55',
      nombre: 'Hector Villalba',
      legajo: 'CH-004',
      usuarioSub: 'chofer_a10b',
      activo: false,
    });
    fetchDrivers.mockResolvedValue([driver(), hector]);
    reactivateDriver.mockResolvedValue({ ...hector, activo: true });
    render(<DriversPage />);

    await user.click(await screen.findByLabelText('Mostrar dados de baja'));
    await user.click(rowFor('Hector Villalba').getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(reactivateDriver).toHaveBeenCalledWith(hector.id));
    expect(
      await screen.findByText(/Hector Villalba vuelve a estar activo, con la credencial que ya tenía/),
    ).toBeInTheDocument();
  });

  /**
   * La baja no toca el `usuarioSub`, asi que el que nunca tuvo credencial vuelve
   * igual de mudo que antes: recibe rutas y no las ve. Decirlo es la razon de
   * ser de la columna Acceso.
   */
  it('al reactivar a alguien sin credencial avisa que todavia no tiene acceso', async () => {
    const user = userEvent.setup();
    const sinAcceso = driver({
      id: 'd7b3e5c1-9a24-4f60-8d19-3e0c6b8a2f55',
      nombre: 'Hector Villalba',
      legajo: 'CH-004',
      usuarioSub: null,
      activo: false,
    });
    fetchDrivers.mockResolvedValue([sinAcceso]);
    reactivateDriver.mockResolvedValue({ ...sinAcceso, activo: true });
    render(<DriversPage />);

    await user.click(await screen.findByLabelText('Mostrar dados de baja'));
    await user.click(rowFor('Hector Villalba').getByRole('button', { name: 'Reactivar' }));

    expect(await screen.findByText(/Todavía no tiene acceso: emitile una credencial/)).toBeInTheDocument();
  });

  it('si reactivar falla muestra el error y no dice que volvio', async () => {
    const user = userEvent.setup();
    const hector = driver({
      id: 'd7b3e5c1-9a24-4f60-8d19-3e0c6b8a2f55',
      nombre: 'Hector Villalba',
      legajo: 'CH-004',
      activo: false,
    });
    fetchDrivers.mockResolvedValue([hector]);
    reactivateDriver.mockRejectedValue(
      new ApiError({ code: 'HTTP_403', status: 403, message: 'Requiere rol ADMINISTRADOR' }),
    );
    render(<DriversPage />);

    await user.click(await screen.findByLabelText('Mostrar dados de baja'));
    await user.click(rowFor('Hector Villalba').getByRole('button', { name: 'Reactivar' }));

    expect(await screen.findByText('[HTTP_403]')).toBeInTheDocument();
    expect(screen.queryByText(/vuelve a estar activo/)).not.toBeInTheDocument();
    expect(rowFor('Hector Villalba').getByRole('button', { name: 'Reactivar' })).toBeEnabled();
  });

  /**
   * El `usuarioSub` no se escribe a mano: eso es volver al `choferId` de texto
   * libre. El acceso sale solo de emitir la credencial.
   */
  it('el alta manda nombre y legajo recortados, y nunca un usuarioSub', async () => {
    const user = userEvent.setup();
    createDriver.mockResolvedValue(driver({ nombre: 'Ana Ruiz', legajo: 'CH-010', usuarioSub: null }));
    render(<DriversPage />);

    await user.click(await screen.findByRole('button', { name: '+ Nuevo chofer' }));
    await user.type(screen.getByLabelText(/Nombre/), '  Ana Ruiz ');
    await user.type(screen.getByLabelText(/Legajo/), ' CH-010');
    await user.click(screen.getByRole('button', { name: 'Dar de alta' }));

    await waitFor(() => expect(createDriver).toHaveBeenCalledWith({ nombre: 'Ana Ruiz', legajo: 'CH-010' }));
    expect(await screen.findByText(/Ana Ruiz \(CH-010\) dado de alta. Todavía no tiene acceso/)).toBeInTheDocument();
  });

  /**
   * El unico cuenta tambien a los dados de baja, que no se ven por defecto: el
   * 409 solo, apunta a un legajo que no aparece en ningun lado.
   */
  it('el legajo duplicado avisa que puede ser de un chofer dado de baja', async () => {
    const user = userEvent.setup();
    createDriver.mockRejectedValue(
      new ApiError({ code: 'CHOFER_LEGAJO_DUPLICADO', status: 409, message: 'Ya existe un chofer con el legajo "CH-004"' }),
    );
    render(<DriversPage />);

    await user.click(await screen.findByRole('button', { name: '+ Nuevo chofer' }));
    await user.type(screen.getByLabelText(/Nombre/), 'Hector Villalba');
    await user.type(screen.getByLabelText(/Legajo/), 'CH-004');
    await user.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText('[CHOFER_LEGAJO_DUPLICADO]')).toBeInTheDocument();
    expect(screen.getByText(/Puede ser de un chofer dado de baja/)).toBeInTheDocument();
  });

  it('los errores de validacion van debajo del campo que los causo', async () => {
    const user = userEvent.setup();
    createDriver.mockRejectedValue(
      new ApiError({
        code: 'HTTP_400',
        status: 400,
        message: 'legajo must be longer than or equal to 2 characters',
        details: ['legajo must be longer than or equal to 2 characters'],
      }),
    );
    render(<DriversPage />);

    await user.click(await screen.findByRole('button', { name: '+ Nuevo chofer' }));
    await user.type(screen.getByLabelText(/Nombre/), 'Ana Ruiz');
    await user.type(screen.getByLabelText(/Legajo/), 'C');
    await user.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText('must be longer than or equal to 2 characters')).toBeInTheDocument();
    expect(screen.queryByText('[HTTP_400]')).not.toBeInTheDocument();
  });

  it('editar manda los cambios al chofer de esa fila', async () => {
    const user = userEvent.setup();
    updateDriver.mockResolvedValue(driver({ nombre: 'Juana Pérez' }));
    render(<DriversPage />);

    await screen.findByText('Juana Perez');
    await user.click(rowFor('Juana Perez').getByRole('button', { name: 'Editar' }));

    const name = screen.getByLabelText(/Nombre/);
    expect(name).toHaveValue('Juana Perez');
    await user.clear(name);
    await user.type(name, 'Juana Pérez');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(updateDriver).toHaveBeenCalledWith(JUANA_ID, { nombre: 'Juana Pérez', legajo: 'CH-001' }));
    expect(await screen.findByText('Juana Pérez actualizado.')).toBeInTheDocument();
  });

  /**
   * El backend rechaza esta baja con 409, pero el aviso previo se queda: es la
   * diferencia entre saber por que no se puede antes de apretar y descubrirlo
   * con un error. Tambien dice que se puede deshacer, que es lo que la volvio
   * una decision reversible.
   */
  it('la baja avisa si el chofer tiene una ruta sin terminar', async () => {
    const user = userEvent.setup();
    fetchRoutes.mockResolvedValue([
      { id: 'rt-01', choferId: JUANA_ID, estado: 'EN_CURSO', camion: { patente: 'AB123CD' } },
      { id: 'rt-02', choferId: JUANA_ID, estado: 'COMPLETADA', camion: { patente: 'AC456EF' } },
    ]);
    render(<DriversPage />);

    await screen.findByText('Juana Perez');
    await user.click(rowFor('Juana Perez').getByRole('button', { name: 'Dar de baja' }));

    expect(await dialog().findByText('Tiene una ruta sin terminar')).toBeInTheDocument();
    expect(dialog().getByText('AB123CD')).toBeInTheDocument();
    expect(dialog().getByText(/se puede deshacer/)).toBeInTheDocument();
  });

  /**
   * El 409 que cierra el agujero del camion varado: sin acceso el chofer no
   * puede cerrar sus paradas, la ruta no cierra hasta que no le quede ninguna
   * pendiente y el camion no se libera hasta que la ruta cierre.
   *
   * Reintentar no puede funcionar hasta que la ruta cierre, asi que el boton se
   * va: dejarlo es ofrecer el mismo error de nuevo.
   */
  it('el 409 de ruta activa dice que hay que cerrar la ruta y saca el boton de baja', async () => {
    const user = userEvent.setup();
    fetchRoutes.mockResolvedValue([]);
    deleteDriver.mockRejectedValue(
      new ApiError({
        code: 'CHOFER_CON_RUTA_ACTIVA',
        status: 409,
        message: 'Juana Perez tiene una ruta en_curso. Hay que cerrarla antes de darlo de baja',
      }),
    );
    render(<DriversPage />);

    await screen.findByText('Juana Perez');
    await user.click(rowFor('Juana Perez').getByRole('button', { name: 'Dar de baja' }));
    await user.click(dialog().getByRole('button', { name: 'Dar de baja' }));

    expect(await dialog().findByText('No se puede dar de baja todavía')).toBeInTheDocument();
    expect(dialog().getByText(/Hay que cerrarla antes de darlo de baja/)).toBeInTheDocument();
    expect(dialog().queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
    expect(screen.queryByText(/dado de baja\./)).not.toBeInTheDocument();
  });

  it('sin ruta viva la baja no muestra el aviso', async () => {
    const user = userEvent.setup();
    fetchRoutes.mockResolvedValue([
      { id: 'rt-02', choferId: JUANA_ID, estado: 'COMPLETADA', camion: { patente: 'AC456EF' } },
    ]);
    render(<DriversPage />);

    await screen.findByText('Juana Perez');
    await user.click(rowFor('Juana Perez').getByRole('button', { name: 'Dar de baja' }));

    await waitFor(() => expect(fetchRoutes).toHaveBeenCalled());
    expect(screen.queryByText('Tiene una ruta sin terminar')).not.toBeInTheDocument();
  });

  it('si no se pueden leer las rutas, la baja se puede hacer igual', async () => {
    const user = userEvent.setup();
    fetchRoutes.mockRejectedValue(new ApiError({ code: 'SIN_CONEXION', status: 0, message: 'sin red' }));
    deleteDriver.mockResolvedValue(null);
    render(<DriversPage />);

    await screen.findByText('Rocio Ledesma');
    await user.click(rowFor('Rocio Ledesma').getByRole('button', { name: 'Dar de baja' }));
    await user.click(dialog().getByRole('button', { name: 'Dar de baja' }));

    await waitFor(() => expect(deleteDriver).toHaveBeenCalledWith(rocio.id));
  });

  it('una baja rechazada muestra el codigo y deja el modal abierto', async () => {
    const user = userEvent.setup();
    deleteDriver.mockRejectedValue(
      new ApiError({ code: 'HTTP_403', status: 403, message: 'Requiere rol ADMINISTRADOR' }),
    );
    render(<DriversPage />);

    await screen.findByText('Rocio Ledesma');
    await user.click(rowFor('Rocio Ledesma').getByRole('button', { name: 'Dar de baja' }));
    await user.click(dialog().getByRole('button', { name: 'Dar de baja' }));

    expect(await dialog().findByText('[HTTP_403]')).toBeInTheDocument();
    expect(dialog().getByRole('button', { name: 'Dar de baja' })).toBeEnabled();
  });

  /**
   * Emitir rota el `usuarioSub`: el listado se recarga para que "Sin acceso"
   * pase a "Con acceso" sin refrescar la pagina.
   */
  it('emitir la credencial desde el listado lo recarga al cerrar', async () => {
    const user = userEvent.setup();
    issueDriverCredential.mockResolvedValue({
      choferId: rocio.id,
      nombre: 'Rocio Ledesma',
      legajo: 'CH-003',
      token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjaG9mZXJfYWJjIn0.firma',
      expiraEn: '30d',
    });
    render(<DriversPage />);

    await screen.findByText('Rocio Ledesma');
    await user.click(rowFor('Rocio Ledesma').getByRole('button', { name: 'Emitir credencial' }));
    await user.click(dialog().getByRole('button', { name: 'Emitir credencial' }));

    await user.click(await screen.findByRole('checkbox', { name: /Guardé la credencial/ }));
    fetchDrivers.mockResolvedValue([driver(), { ...rocio, usuarioSub: 'chofer_nuevo' }]);
    await user.click(screen.getByRole('button', { name: /Ya la guardé/ }));

    expect(await screen.findByText(/Credencial emitida para Rocio Ledesma/)).toBeInTheDocument();
    await waitFor(() => expect(rowFor('Rocio Ledesma').getByText('Con acceso')).toBeInTheDocument());
    expect(issueDriverCredential).toHaveBeenCalledWith(rocio.id);
  });

  it('si el listado falla muestra el codigo', async () => {
    fetchDrivers.mockRejectedValue(
      new ApiError({ code: 'HTTP_403', status: 403, message: 'Requiere rol ADMINISTRADOR u OPERADOR' }),
    );
    render(<DriversPage />);

    expect(await screen.findByText('[HTTP_403]')).toBeInTheDocument();
  });
});
