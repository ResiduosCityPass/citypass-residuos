import { useState } from 'react';
import { Icons } from './Icons.jsx';
import TokenBar from '../TokenBar.jsx';
import Chip from '../ui/Chip.jsx';
import Button from '../ui/Button.jsx';
import { USING_MOCKS } from '../../api/waste.js';

/**
 * Barra superior: titulo de la pantalla, alertas abiertas, sesion.
 *
 * El campo del token vive plegado detras de un boton. Es un parche de desarrollo
 * hasta que el Squad 2 publique el login federado (ADR-005), y un input de JWT
 * permanentemente a la vista en la cabecera de la app no es una pantalla que uno
 * quiera mostrar en la defensa.
 */
export default function TopBar({ title, subtitle, openAlerts, onTokenChange }) {
  const [tokenOpen, setTokenOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>

      <div className="topbar-actions">
        {/* Que los datos son inventados tiene que estar escrito en la pantalla.
            Un tablero de alertas creible con datos falsos y sin cartel es la
            clase de cosa que termina en una captura de pantalla de una demo. */}
        {USING_MOCKS && (
          <Chip variant="warning" title="VITE_USE_MOCKS=true — no hay backend detras de esta pantalla">
            Datos de demostracion
          </Chip>
        )}

        <button className="topbar-icon" type="button" title={`${openAlerts} alertas sin resolver`}>
          <Icons.alerts />
          {openAlerts > 0 && <span className="topbar-dot">{openAlerts}</span>}
        </button>

        {!USING_MOCKS && (
          <Button variant="ghost" size="sm" onClick={() => setTokenOpen((v) => !v)}>
            {tokenOpen ? 'Ocultar token' : 'Token'}
          </Button>
        )}

        <div className="topbar-profile">
          <Icons.profile />
          <span>Operador</span>
        </div>
      </div>

      {tokenOpen && !USING_MOCKS && (
        <div className="topbar-token">
          <TokenBar onChange={onTokenChange} />
        </div>
      )}
    </header>
  );
}
