import { useState } from 'react';
import { readToken, saveToken, clearToken } from '../api/client.js';

/**
 * Hasta que el Squad 2 publique el login federado, el token se genera a mano:
 *   cd backend && npm run token:dev -- ADMINISTRADOR
 * Dura 8 horas. Cuando exista el login real cambia de donde sale el token,
 * pero el header `Authorization: Bearer <jwt>` no cambia.
 */
export default function TokenBar({ onChange }) {
  const [value, setValue] = useState(readToken());
  const hasToken = Boolean(readToken());

  const save = (event) => {
    event.preventDefault();
    saveToken(value);
    onChange();
  };

  const clear = () => {
    clearToken();
    setValue('');
    onChange();
  };

  return (
    <form className="token-bar" onSubmit={save}>
      <input
        type="password"
        value={value}
        placeholder="Pega aca el JWT de npm run token:dev"
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
      />
      <button type="submit">Usar token</button>
      {hasToken && (
        <button type="button" className="secondary" onClick={clear}>
          Borrar
        </button>
      )}
    </form>
  );
}
