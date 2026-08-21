import { useState } from 'react';
import { leerToken, guardarToken, borrarToken } from '../api/cliente.js';

/**
 * Hasta que el Squad 2 publique el login federado, el token se genera a mano:
 *   cd backend && npm run token:dev -- ADMINISTRADOR
 * Dura 8 horas. Cuando exista el login real cambia de donde sale el token,
 * pero el header `Authorization: Bearer <jwt>` no cambia.
 */
export default function BarraToken({ onCambio }) {
  const [valor, setValor] = useState(leerToken());
  const hayToken = Boolean(leerToken());

  const guardar = (evento) => {
    evento.preventDefault();
    guardarToken(valor);
    onCambio();
  };

  const limpiar = () => {
    borrarToken();
    setValor('');
    onCambio();
  };

  return (
    <form className="barra-token" onSubmit={guardar}>
      <input
        type="password"
        value={valor}
        placeholder="Pega aca el JWT de npm run token:dev"
        onChange={(e) => setValor(e.target.value)}
        autoComplete="off"
      />
      <button type="submit">Usar token</button>
      {hayToken && (
        <button type="button" className="secundario" onClick={limpiar}>
          Borrar
        </button>
      )}
    </form>
  );
}
