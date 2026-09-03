import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

/**
 * Marco de la aplicacion: sidebar fijo a la izquierda, barra superior arriba y
 * la pantalla adentro. Las cuatro pantallas del modulo lo comparten, asi que el
 * cromo se define una sola vez y no se puede desincronizar entre pantallas.
 */
export default function Shell({ title, subtitle, openAlerts, onTokenChange, children }) {
  return (
    <div className="shell">
      <Sidebar openAlerts={openAlerts} />
      <div className="shell-column">
        <TopBar
          title={title}
          subtitle={subtitle}
          openAlerts={openAlerts}
          onTokenChange={onTokenChange}
        />
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
