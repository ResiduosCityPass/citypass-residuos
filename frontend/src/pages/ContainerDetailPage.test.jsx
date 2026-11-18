import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ContainerDetailPage from './ContainerDetailPage.jsx';
import { fetchContainer, fetchAlerts, fetchPrediction, setContainerOutOfService } from '../api/waste.js';
import { ApiError } from '../api/client.js';
import { SessionContext } from '../auth/SessionContext.js';
import { simulateContainerReading, fetchOperatorIdentity } from '../api/waste.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchContainer: vi.fn(),
  fetchAlerts: vi.fn(),
  fetchPrediction: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
  setContainerOutOfService: vi.fn(),
  simulateContainerReading: vi.fn(),
  fetchOperatorIdentity: vi.fn(),
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

const view = (rol = null, onAlertsChanged, tokenVersion = 0) => (
    <SessionContext.Provider value={rol === 'LOCAL' ? null : { rol }}>
    <MemoryRouter initialEntries={['/contenedores/ct-3']}>
      <Routes>
        <Route path="/contenedores/:id" element={<ContainerDetailPage onAlertsChanged={onAlertsChanged} tokenVersion={tokenVersion} />} />
      </Routes>
    </MemoryRouter>
    </SessionContext.Provider>
  );
const mount = (...args) => render(view(...args));

describe('detalle del contenedor', () => {
  it('al cambiar la credencial local descarta la identidad anterior y las respuestas tardias', async () => {
    let resolveOld;
    fetchContainer.mockResolvedValue(detail());
    fetchOperatorIdentity.mockImplementationOnce(() => new Promise((done) => { resolveOld = done; }))
      .mockResolvedValue({ rol: 'OPERADOR' });
    const page = mount('LOCAL');
    await screen.findByText('CT-0003');
    page.rerender(view('LOCAL', undefined, 1));
    await act(async () => { resolveOld({ rol: 'ADMINISTRADOR' }); });
    expect(fetchOperatorIdentity).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Simular lectura' })).not.toBeInTheDocument();
  });

  it('en modo local consulta el rol al backend antes de mostrar la simulacion', async () => {
    fetchContainer.mockResolvedValue(detail());
    fetchOperatorIdentity.mockResolvedValue({ rol: 'ADMINISTRADOR' });
    mount('LOCAL');
    expect(await screen.findByRole('button', { name: 'Simular lectura' })).toBeEnabled();
    expect(fetchOperatorIdentity).toHaveBeenCalledOnce();
  });

  it('sin verificacion local del rol no ofrece simular', async () => {
    fetchContainer.mockResolvedValue(detail());
    fetchOperatorIdentity.mockRejectedValue(new Error('Sin sesion'));
    mount('LOCAL');
    await screen.findByText('CT-0003');
    expect(screen.queryByRole('button', { name: 'Simular lectura' })).not.toBeInTheDocument();
  });
  it.each(['OPERADOR', 'CHOFER', null])('no ofrece la simulacion al rol %s', async (rol) => {
    fetchContainer.mockResolvedValue(detail());
    mount(rol);
    await screen.findByText('CT-0003');
    expect(screen.queryByRole('button', { name: 'Simular lectura' })).not.toBeInTheDocument();
  });

  it.each([
    { sensor: null }, { estado: 'FUERA_DE_SERVICIO' },
  ])('deshabilita la simulacion cuando no se puede registrar: %j', async (extras) => {
    fetchContainer.mockResolvedValue(detail(extras));
    mount('ADMINISTRADOR');
    expect(await screen.findByRole('button', { name: 'Simular lectura' })).toBeDisabled();
  });

  it('el admin confirma una lectura y recarga contenedor, alertas y contador', async () => {
    fetchContainer.mockResolvedValueOnce(detail({ temperaturaC: 20 }))
      .mockResolvedValue(detail({ nivelLlenadoPct: 90, estado: 'CRITICO', ultimaLecturaEn: '2026-11-18T15:00:00Z' }));
    simulateContainerReading.mockResolvedValue({ estadoNuevo: 'CRITICO' });
    const changed = vi.fn();
    mount('ADMINISTRADOR', changed);
    await userEvent.click(await screen.findByRole('button', { name: 'Simular lectura' }));
    const field = screen.getByLabelText(/Nivel de llenado/);
    await userEvent.clear(field); await userEvent.type(field, '90');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar lectura' }));
    expect(await screen.findByText(/90% de llenado/)).toBeInTheDocument();
    expect(screen.getByText('Lectura simulada registrada')).toBeInTheDocument();
    expect(fetchAlerts).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

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

  it('saca el contenedor de servicio y recarga el detalle', async () => {
    fetchContainer
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ estado: 'FUERA_DE_SERVICIO' }));
    setContainerOutOfService.mockResolvedValue({ id: 'ct-3', estado: 'FUERA_DE_SERVICIO' });
    mount();

    await userEvent.click(await screen.findByRole('button', { name: 'Poner fuera de servicio' }));

    expect(setContainerOutOfService).toHaveBeenCalledWith('ct-3', true);
    expect(await screen.findByRole('button', { name: 'Reintegrar al servicio' })).toBeEnabled();
    expect(fetchContainer).toHaveBeenCalledTimes(2);
  });

  /**
   * Al reintegrarlo el backend lo reevalua contra el umbral de la zona: uno que
   * quedo lleno vuelve CRITICO, no NORMAL. El aviso dice el estado que devolvio
   * el backend, no el que uno supondria.
   */
  it('al reintegrarlo avisa el estado en que quedo segun el umbral', async () => {
    fetchContainer
      .mockResolvedValueOnce(detail({ estado: 'FUERA_DE_SERVICIO', nivelLlenadoPct: 85 }))
      .mockResolvedValueOnce(detail({ estado: 'CRITICO', nivelLlenadoPct: 85 }));
    setContainerOutOfService.mockResolvedValue({ id: 'ct-3', estado: 'CRITICO' });
    mount();

    await userEvent.click(await screen.findByRole('button', { name: 'Reintegrar al servicio' }));

    expect(setContainerOutOfService).toHaveBeenCalledWith('ct-3', false);
    expect(await screen.findByText(/umbral de Centro: queda en Critico/)).toBeInTheDocument();
  });

  it('si el cambio de servicio falla, muestra el error sin romper la pantalla', async () => {
    fetchContainer.mockResolvedValue(detail());
    setContainerOutOfService.mockRejectedValue(
      new ApiError({ code: 'HTTP_403', status: 403, message: 'Acceso denegado' }),
    );
    mount();

    await userEvent.click(await screen.findByRole('button', { name: 'Poner fuera de servicio' }));

    expect(await screen.findByText('[HTTP_403]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poner fuera de servicio' })).toBeEnabled();
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
