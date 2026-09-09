import { useState } from 'react';
import { readToken, saveToken, clearToken } from '../api/client.js';

/**
 * Donde se pega el token que va en `Authorization: Bearer <jwt>`.
 *
 * Lo usan dos pantallas que no se parecen en nada. En el panel del operador es
 * andamiaje hasta que el Squad 2 publique el login federado, y el token se
 * fabrica a mano con `npm run token:dev -- ADMINISTRADOR`. En /chofer es la
 * puerta de entrada de verdad: la credencial que le emitio el operador desde el
 * ABM, que se muestra una sola vez y no se puede volver a consultar.
 *
 * Por eso el texto se pasa desde afuera: mandar a un chofer parado en la calle
 * a correr un comando de npm seria absurdo. Lo que no cambia entre las dos es
 * lo unico que hace este componente, que es guardar el token en este
 * dispositivo.
 */
export default function TokenBar({
  onChange,
  placeholder = 'Pega aca el JWT de npm run token:dev',
  submitLabel = 'Usar token',
}) {
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
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
      />
      <button type="submit" disabled={!value.trim()}>{submitLabel}</button>
      {hasToken && (
        <button type="button" className="secondary" onClick={clear}>
          Borrar
        </button>
      )}
    </form>
  );
}
