import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertsPage from './AlertsPage.jsx';
import { fetchAlerts, fetchContainers, acknowledgeAlert } from '../api/waste.js';

vi.mock('../api/waste.js', () => ({
  USING_MOCKS: false,
  fetchAlerts: vi.fn(),
  fetchContainers: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
}));

const alert = (extras = {}) => ({
  id: 'al-1',
  contenedorId: 'ct-1',
  tipo: 'SATURACION',
  severidad: 'MEDIA',
  estado: 'ABIERTA',
  detalle: 'Nivel 76% supera el umbral 70% de la zona Centro',
  detectadaEn: new Date().toISOString(),
  resueltaEn: null,
  ...extras,
});

describe('CU-05 / CU-06 tablero de alertas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchContainers.mockResolvedValue([{ id: 'ct-1', codigo: 'CT-0001' }]);
  });

  /**
   * El incendio se evalua contra la temperatura, no contra el llenado: un
   * contenedor verde al 5% puede tener una alerta CRITICA abierta. Es el caso
   * que no se puede pasar por alto, y por eso sale de la lista general.
   */
  it('separa los incendios sin resolver del resto', async () => {
    fetchAlerts.mockResolvedValue([
      alert({ id: 'al-f', tipo: 'INCENDIO', severidad: 'CRITICA', detalle: 'Temperatura 91.4C' }),
      alert(),
    ]);
    render(<AlertsPage />);

    const block = (await screen.findByText(/Incendios sin resolver/)).closest('section');
    expect(within(block).getByText('Temperatura 91.4C')).toBeInTheDocument();
    expect(within(block).queryByText(/Nivel 76%/)).not.toBeInTheDocument();
  });

  it('un incendio ya resuelto no ocupa el bloque de maxima prioridad', async () => {
    fetchAlerts.mockResolvedValue([alert({ tipo: 'INCENDIO', estado: 'RESUELTA' })]);
    render(<AlertsPage />);

    await screen.findByText(/Alertas \(1\)/);
    expect(screen.queryByText(/Incendios sin resolver/)).not.toBeInTheDocument();
  });

  /**
   * GET /alertas trae contenedorId pero no el codigo. Se cruza contra los
   * contenedores ya cargados: pedir el detalle de cada alerta seria una llamada
   * por fila para mostrar seis caracteres.
   */
  it('muestra el codigo del contenedor cruzandolo, no un UUID', async () => {
    fetchAlerts.mockResolvedValue([alert()]);
    render(<AlertsPage />);

    // Acotado a la alerta: CT-0001 tambien es una opcion del filtro por contenedor.
    const row = (await screen.findByText(/Nivel 76%/)).closest('li');
    expect(within(row).getByText('CT-0001')).toBeInTheDocument();
  });

  it('atender una alerta la recarga y avisa al resto de la aplicacion', async () => {
    const user = userEvent.setup();
    const onAlertsChanged = vi.fn();
    fetchAlerts.mockResolvedValue([alert()]);
    acknowledgeAlert.mockResolvedValue(alert({ estado: 'EN_ATENCION' }));

    render(<AlertsPage onAlertsChanged={onAlertsChanged} />);
    await user.click(await screen.findByRole('button', { name: 'Atender' }));

    await waitFor(() => expect(acknowledgeAlert).toHaveBeenCalledWith('al-1'));
    // El globo del sidebar cuenta lo que falta atender: si no se le avisa,
    // queda mostrando un numero que ya no es cierto.
    expect(onAlertsChanged).toHaveBeenCalled();
  });

  it('filtrar por estado se traduce en un query param', async () => {
    const user = userEvent.setup();
    fetchAlerts.mockResolvedValue([]);
    render(<AlertsPage />);

    await screen.findByText(/Alertas \(0\)/);
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'ABIERTA');

    await waitFor(() =>
      expect(fetchAlerts).toHaveBeenLastCalledWith(
        expect.objectContaining({ estado: 'ABIERTA' }),
      ),
    );
  });
});
