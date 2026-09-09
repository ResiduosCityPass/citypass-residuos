import { useCallback, useEffect, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

/**
 * Marco de la aplicacion: sidebar fijo a la izquierda, barra superior arriba y
 * la pantalla adentro. Las cuatro pantallas del modulo lo comparten, asi que el
 * cromo se define una sola vez y no se puede desincronizar entre pantallas.
 *
 * En pantallas angostas el sidebar deja de ocupar una columna y pasa a ser un
 * cajon que entra desde la izquierda. Antes se apilaba ARRIBA del contenido:
 * quince items de navegacion mas el pie empujaban la pantalla real fuera de
 * vista, y en un celular habia que scrollear todo el menu para llegar al mapa.
 *
 * El estado vive aca y no en cada pantalla porque el que lo abre (el boton de
 * la barra superior) y el que lo cierra (el propio menu, el fondo, Escape) son
 * hermanos, no padre e hijo.
 */
export default function Shell({ title, subtitle, openAlerts, onTokenChange, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = useCallback(() => setMenuOpen(false), []);

  // Escape cierra, como en el modal. Es la unica salida sin mouse cuando el
  // cajon esta abierto y el foco quedo adentro.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, close]);

  // Sin esto, scrollear el cajon arrastra la pantalla de atras y al cerrar
  // aparece en otro lugar del que estaba.
  useEffect(() => {
    if (!menuOpen) return undefined;
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [menuOpen]);

  return (
    <div className="shell">
      {/* El fondo oscuro cierra al tocarlo. Es un div y no un boton porque no
          agrega nada al orden de tabulacion que Escape no resuelva mejor, y un
          boton invisible a pantalla completa se anuncia como un control mas. */}
      {menuOpen && <div className="sidebar-backdrop" onClick={close} aria-hidden="true" />}

      <Sidebar openAlerts={openAlerts} open={menuOpen} onNavigate={close} />

      <div className="shell-column">
        <TopBar
          title={title}
          subtitle={subtitle}
          openAlerts={openAlerts}
          onTokenChange={onTokenChange}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((open) => !open)}
        />
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
