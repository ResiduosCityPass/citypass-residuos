import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TokenBar from './TokenBar.jsx';
import { readToken, saveToken, clearToken } from '../api/client.js';

/**
 * La barra donde se pega el token.
 *
 * En el panel del operador es andamiaje hasta que llegue el login federado,
 * pero en /chofer es la puerta de entrada de verdad, y ahi el error humano es
 * facil: la credencial se copia de un celular a otro y se pega cortada. Lo que
 * se prueba aca es el rechazo, que es lo unico que el componente decide por su
 * cuenta; que el valor no llegue al storage lo prueba `client.test.js`.
 */

/** Tres bloques base64url, con la firma HS256 de 43 caracteres. */
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJjaG9mZXJfYWJjIiwidG9rZW5fdXNlIjoiY2hvZmVyLWludGVybm8ifQ.' +
  'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

/** Lo que queda cuando la seleccion se corta en el primer punto. */
const MEDIA_CREDENCIAL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

const campo = () => screen.getByPlaceholderText(/Pega aca el JWT/);
const enviar = () => screen.getByRole('button', { name: 'Usar token' });

describe('TokenBar', () => {
  beforeEach(() => clearToken());
  afterEach(() => clearToken());

  it('una credencial incompleta no se guarda, lo dice, y no recarga la pantalla', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TokenBar onChange={onChange} />);

    await user.type(campo(), MEDIA_CREDENCIAL);
    await user.click(enviar());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /tres bloques separados por puntos/,
    );
    expect(campo()).toHaveAttribute('aria-invalid', 'true');
    expect(readToken()).toBe('');
    // Avisar al padre dispararia la carga de nuevo, y el 401 de esa request
    // aterriza encima del aviso que ya explica que falto pegar un pedazo.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('el aviso se va apenas se sigue escribiendo, y con la credencial entera entra', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TokenBar onChange={onChange} />);

    await user.type(campo(), MEDIA_CREDENCIAL);
    await user.click(enviar());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.clear(campo());
    await user.type(campo(), JWT);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(campo()).not.toHaveAttribute('aria-invalid');

    await user.click(enviar());

    expect(readToken()).toBe(JWT);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  /**
   * El caso caro: el chofer ya esta adentro y pega algo cortado encima. Un
   * rechazo no puede costarle la credencial que tenia, porque no se puede
   * volver a consultar y emitir otra rota el `usuarioSub`.
   */
  it('una credencial incompleta no pisa la que ya estaba puesta', async () => {
    const user = userEvent.setup();
    saveToken(JWT);
    render(<TokenBar onChange={vi.fn()} />);

    await user.clear(campo());
    await user.type(campo(), MEDIA_CREDENCIAL);
    await user.click(enviar());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(readToken()).toBe(JWT);
  });

  /** Borrar es la salida cuando la credencial que hay dejo de servir. */
  it('Borrar saca la credencial, limpia el campo y avisa al padre', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    saveToken(JWT);
    render(<TokenBar onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Borrar' }));

    expect(readToken()).toBe('');
    expect(campo().value).toBe('');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
