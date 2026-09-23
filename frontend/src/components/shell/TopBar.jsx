import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from './Icons.jsx';
import TokenBar from '../TokenBar.jsx';
import Chip from '../ui/Chip.jsx';
import Button from '../ui/Button.jsx';
import { USING_MOCKS } from '../../api/waste.js';
import { usingDevToken, decodeTokenClaims } from '../../api/client.js';

/**
 * Grupo del token (ADR-009) -> etiqueta para mostrar. Es cosmetico, no
 * autorizacion -- eso lo resuelve el backend con `grupo-rol.map.ts`. Si el
 * primer grupo reconocido no aparece aca, se muestra el grupo crudo antes que
 * nada: un operador viendo "operador" en vez de "Sin rol" sigue entendiendo
 * quien es.
 */
const ROLE_LABEL = { administrador: 'Administrador', operador: 'Operador', chofer: 'Chofer' };

function currentRoleLabel() {
  const groups = decodeTokenClaims()?.groups ?? [];
  const known = groups.find((group) => ROLE_LABEL[group]);
  return known ? ROLE_LABEL[known] : (groups[0] ?? 'Sin rol');
}

/**
 * Barra superior: titulo de la pantalla, alertas abiertas, sesion.
 *
 * El campo del token vive plegado detras de un boton. Es un parche de desarrollo
 * hasta que el Squad 2 publique el login federado (ADR-005), y un input de JWT
 * permanentemente a la vista en la cabecera de la app no es una pantalla que uno
 * quiera mostrar en la defensa.
 *
 * Con VITE_DEV_TOKEN configurada no aparece siquiera el boton: la app ya elige
 * el token segun la pantalla. Dejarlo visible solo daba lugar a pegar ahi el
 * token equivocado y dejar el resto del modulo en 401, que es exactamente lo
 * que pasaba.
 */
export default function TopBar({ title, subtitle, openAlerts, onTokenChange, menuOpen, onToggleMenu }) {
  const [tokenOpen, setTokenOpen] = useState(false);

  // Sin backend no hay token que pegar; con token de desarrollo, tampoco.
  const mostrarToken = !USING_MOCKS && !usingDevToken();

  return (
    <header className="topbar">
      {/* Solo existe en pantallas angostas, donde el sidebar es un cajon. Lo
          esconde el CSS y no una condicion de JS a proposito: el punto de corte
          es el mismo que mueve al sidebar, y tenerlo escrito una sola vez es lo
          que evita que el boton aparezca cuando el menu ya esta a la vista. */}
      <button
        type="button"
        className="topbar-icon shell-menu-button"
        onClick={onToggleMenu}
        aria-label={menuOpen ? 'Cerrar menu' : 'Abrir menu'}
        aria-expanded={menuOpen}
      >
        {menuOpen ? <Icons.close /> : <Icons.menu />}
      </button>

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

        <Link to="/alertas" className="topbar-icon" title={`${openAlerts} alertas sin resolver`}>
          <Icons.alerts />
          {openAlerts > 0 && <span className="topbar-dot">{openAlerts}</span>}
        </Link>

        {mostrarToken && (
          <Button variant="ghost" size="sm" onClick={() => setTokenOpen((v) => !v)}>
            {tokenOpen ? 'Ocultar token' : 'Token'}
          </Button>
        )}

        <div className="topbar-profile">
          <Icons.profile />
          <span>{currentRoleLabel()}</span>
        </div>
      </div>

      {tokenOpen && mostrarToken && (
        <div className="topbar-token">
          <TokenBar onChange={onTokenChange} />
        </div>
      )}
    </header>
  );
}
