import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IssueCredentialModal from './IssueCredentialModal.jsx';
import { issueDriverCredential } from '../../api/waste.js';
import { ApiError } from '../../api/client.js';

vi.mock('../../api/waste.js', () => ({ issueDriverCredential: vi.fn() }));

const withoutAccess = {
  id: 'c4a9f0b6-2d81-4c37-b5e2-9f13a7d6e480',
  nombre: 'Rocio Ledesma',
  legajo: 'CH-003',
  usuarioSub: null,
  activo: true,
};

const withAccess = { ...withoutAccess, usuarioSub: 'chofer_3f9a' };

const credential = {
  choferId: withoutAccess.id,
  nombre: 'Rocio Ledesma',
  legajo: 'CH-003',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjaG9mZXJfYWJjIn0.c2lnbmF0dXJl',
  expiraEn: '30d',
  advertencia: 'Guardala ahora: no se puede volver a consultar. Emitir otra invalida esta.',
};

const renderModal = (driver, handlers = {}) =>
  render(<IssueCredentialModal driver={driver} onDone={vi.fn()} onClose={vi.fn()} {...handlers} />);

describe('emitir la credencial del chofer', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('a quien no tiene acceso le explica que hoy no ve sus rutas', () => {
    renderModal(withoutAccess);

    expect(screen.getByText(/Hoy no tiene acceso/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir credencial' })).toBeInTheDocument();
    expect(screen.queryByText('Ya tiene una credencial')).not.toBeInTheDocument();
  });

  /**
   * Emitir rota el sub y mata la credencial anterior. Es a proposito (celular
   * perdido), pero hecho por error deja al chofer afuera: se avisa ANTES.
   */
  it('a quien ya tiene acceso le avisa que la credencial anterior deja de servir', () => {
    renderModal(withAccess);

    expect(screen.getByText('Ya tiene una credencial')).toBeInTheDocument();
    expect(screen.getByText(/anula la que tiene, en el acto/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir otra credencial' })).toBeInTheDocument();
    expect(issueDriverCredential).not.toHaveBeenCalled();
  });

  it('con el chofer del token de desarrollo avisa que ese token deja de servir', () => {
    renderModal({ ...withAccess, usuarioSub: 'dev-chofer' });

    expect(screen.getByText('Es el chofer del token de desarrollo')).toBeInTheDocument();
  });

  it('muestra la credencial completa, cuanto dura, y no deja cerrar hasta confirmar', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onClose = vi.fn();
    issueDriverCredential.mockResolvedValue(credential);
    renderModal(withoutAccess, { onDone, onClose });

    await user.click(screen.getByRole('button', { name: 'Emitir credencial' }));

    expect(await screen.findByText(credential.token)).toBeInTheDocument();
    expect(screen.getByText(/se muestra una sola vez/)).toBeInTheDocument();
    expect(screen.getByText('En 30 días')).toBeInTheDocument();
    // Sin × en la cabecera: la unica salida es el boton del pie.
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();

    const close = screen.getByRole('button', { name: /Ya la guardé/ });
    expect(close).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    await user.click(close);

    expect(onDone).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(issueDriverCredential).toHaveBeenCalledWith(withoutAccess.id);
  });

  it('copia la credencial al portapapeles', async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: write } });
    issueDriverCredential.mockResolvedValue(credential);
    renderModal(withoutAccess);

    await user.click(screen.getByRole('button', { name: 'Emitir credencial' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar' }));

    expect(write).toHaveBeenCalledWith(credential.token);
    expect(await screen.findByRole('button', { name: '✓ Copiada' })).toBeInTheDocument();
  });

  it('si el portapapeles no esta disponible, el boton no miente que copio', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('sin permiso')) },
    });
    issueDriverCredential.mockResolvedValue(credential);
    renderModal(withoutAccess);

    await user.click(screen.getByRole('button', { name: 'Emitir credencial' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '✓ Copiada' })).not.toBeInTheDocument();
  });

  it('a un chofer dado de baja muestra el 409 y no revela ninguna credencial', async () => {
    const user = userEvent.setup();
    issueDriverCredential.mockRejectedValue(
      new ApiError({ code: 'CHOFER_INACTIVO', status: 409, message: 'El chofer Rocio Ledesma esta dado de baja' }),
    );
    renderModal(withoutAccess);

    await user.click(screen.getByRole('button', { name: 'Emitir credencial' }));

    expect(await screen.findByText('[CHOFER_INACTIVO]')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
