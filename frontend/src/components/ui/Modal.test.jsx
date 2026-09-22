import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal.jsx';

const renderModal = (props = {}) => {
  const onClose = vi.fn();
  const utils = render(
    <Modal title="Nuevo contenedor" onClose={onClose} footer={<button type="button">Guardar</button>} {...props}>
      <input aria-label="Codigo" />
      <input aria-label="Capacidad" />
    </Modal>,
  );
  return { ...utils, onClose };
};

describe('modal del design system', () => {
  it('se anuncia como dialogo con su titulo', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Nuevo contenedor' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Nuevo contenedor' })).toBeInTheDocument();
  });

  /**
   * El primero en orden de DOM es la × de la cabecera. Abrir un formulario con
   * el foco en "cerrar" hace que lo primero que se escriba no vaya a ningun lado.
   */
  it('pone el foco en el primer campo del cuerpo, no en la ×', () => {
    renderModal();

    expect(screen.getByLabelText('Codigo')).toHaveFocus();
  });

  it('la × lo cierra', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape lo cierra', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tocar el fondo lo cierra, pero tocar adentro no', async () => {
    const user = userEvent.setup();
    const { onClose, container } = renderModal();

    await user.click(screen.getByLabelText('Capacidad'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(container.querySelector('.overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * El de la API key del sensor: si se cierra sin copiarla, no hay forma de
   * volver a verla. Ni ×, ni Escape, ni el fondo.
   */
  it('sin closable no hay salida sin pasar por el pie', async () => {
    const user = userEvent.setup();
    const { onClose, container } = renderModal({ closable: false });

    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(container.querySelector('.overlay'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('Tab desde el ultimo control vuelve al primero', async () => {
    const user = userEvent.setup();
    renderModal();

    screen.getByRole('button', { name: 'Guardar' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  });

  it('Shift+Tab desde el primero va al ultimo', async () => {
    const user = userEvent.setup();
    renderModal();

    screen.getByRole('button', { name: 'Cerrar' }).focus();
    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
  });

  it('Tab en el medio sigue el orden normal', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.tab();

    expect(screen.getByLabelText('Capacidad')).toHaveFocus();
  });

  it('sin pie no dibuja el footer', () => {
    const { container } = renderModal({ footer: null });

    expect(container.querySelector('.modal-footer')).not.toBeInTheDocument();
  });

  it('respeta el ancho pedido', () => {
    renderModal({ width: 640 });

    expect(screen.getByRole('dialog')).toHaveStyle({ width: '640px' });
  });
});
