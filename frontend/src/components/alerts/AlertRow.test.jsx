import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertRow from './AlertRow.jsx';

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

const renderRow = (extras, onAction = vi.fn()) => {
  render(<ul><AlertRow alert={alert(extras)} onAction={onAction} /></ul>);
  return {
    acknowledge: screen.getByRole('button', { name: 'Atender' }),
    resolve: screen.getByRole('button', { name: 'Resolver' }),
    onAction,
  };
};

describe('acciones de una alerta', () => {
  it('en ABIERTA se puede atender y resolver', () => {
    const { acknowledge, resolve } = renderRow({ estado: 'ABIERTA' });
    expect(acknowledge).toBeEnabled();
    expect(resolve).toBeEnabled();
  });

  it('en EN_ATENCION ya no se puede atender de nuevo', () => {
    const { acknowledge, resolve } = renderRow({ estado: 'EN_ATENCION' });
    expect(acknowledge).toBeDisabled();
    expect(resolve).toBeEnabled();
  });

  it('en RESUELTA no queda ninguna accion', () => {
    const { acknowledge, resolve } = renderRow({ estado: 'RESUELTA', resueltaEn: new Date().toISOString() });
    expect(acknowledge).toBeDisabled();
    expect(resolve).toBeDisabled();
  });

  it('el boton deshabilitado explica por que, en vez de ser una pared gris', () => {
    const { acknowledge } = renderRow({ estado: 'RESUELTA' });
    expect(acknowledge).toHaveAttribute('title', expect.stringContaining('ABIERTA'));
  });

  it('muestra el detalle redactado por el backend tal cual', () => {
    renderRow({});
    expect(screen.getByText('Nivel 76% supera el umbral 70% de la zona Centro')).toBeInTheDocument();
  });

  it('si la accion falla lo dice sin perder la fila', async () => {
    const usuario = userEvent.setup();
    const onAction = vi.fn().mockRejectedValue({ code: 'ALERTA_NO_ABIERTA', message: 'Ya esta EN_ATENCION' });

    renderRow({ estado: 'ABIERTA' }, onAction);
    await usuario.click(screen.getByRole('button', { name: 'Atender' }));

    expect(await screen.findByText(/ALERTA_NO_ABIERTA/)).toBeInTheDocument();
  });
});
