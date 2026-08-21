import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinkSensorModal from './LinkSensorModal.jsx';
import { linkSensor } from '../../api/waste.js';
import { ApiError } from '../../api/client.js';

vi.mock('../../api/waste.js', () => ({ linkSensor: vi.fn() }));

const container = { id: 'ct-06', codigo: 'CT-0006' };

const credential = {
  sensorId: 'sn-15',
  codigo: 'SN-0015',
  contenedorId: 'ct-06',
  apiKey: '351319aa898ad96fad5eb4e65a537684a2cb251551366e6e',
  advertencia: 'Guardala ahora: no se puede volver a consultar.',
};

describe('vincular sensor y mostrar la API key', () => {
  beforeEach(() => vi.clearAllMocks());

  it('manda el codigo vacio como objeto vacio para que lo genere el backend', async () => {
    const user = userEvent.setup();
    linkSensor.mockResolvedValue(credential);

    render(<LinkSensorModal container={container} onDone={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Vincular sensor' }));

    await waitFor(() => expect(linkSensor).toHaveBeenCalledWith('ct-06', {}));
  });

  /**
   * La regla que justifica todo este modal: el backend guarda solo el hash de la
   * apiKey. Si el usuario cierra sin copiarla, la unica salida es desvincular el
   * sensor y volver a vincularlo. Por eso el cierre esta bloqueado hasta que
   * confirme que la guardo: es la unica friccion deliberada de la aplicacion.
   */
  it('no deja cerrar hasta que se confirma que la clave fue guardada', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    linkSensor.mockResolvedValue(credential);

    render(<LinkSensorModal container={container} onDone={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Vincular sensor' }));

    const close = await screen.findByRole('button', { name: /Ya la guardé/ });
    expect(close).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(close).toBeEnabled();

    await user.click(close);
    expect(onClose).toHaveBeenCalled();
  });

  it('muestra la clave completa y avisa que no vuelve a aparecer', async () => {
    const user = userEvent.setup();
    linkSensor.mockResolvedValue(credential);

    render(<LinkSensorModal container={container} onDone={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Vincular sensor' }));

    expect(await screen.findByText(credential.apiKey)).toBeInTheDocument();
    expect(screen.getByText(/una sola vez/i)).toBeInTheDocument();
    // Sin × en la cabecera: la unica salida es el boton del pie.
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
  });

  it('copia la clave al portapapeles', async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: write } });
    linkSensor.mockResolvedValue(credential);

    render(<LinkSensorModal container={container} onDone={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Vincular sensor' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar' }));

    expect(write).toHaveBeenCalledWith(credential.apiKey);
    expect(await screen.findByRole('button', { name: '✓ Copiada' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('si el contenedor ya tiene sensor muestra el 409 y no revela ninguna clave', async () => {
    const user = userEvent.setup();
    linkSensor.mockRejectedValue(
      new ApiError({
        code: 'CONTENEDOR_YA_TIENE_SENSOR',
        status: 409,
        message: 'El contenedor CT-0006 ya tiene un sensor vinculado',
      }),
    );

    render(<LinkSensorModal container={container} onDone={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Vincular sensor' }));

    expect(await screen.findByText('[CONTENEDOR_YA_TIENE_SENSOR]')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
