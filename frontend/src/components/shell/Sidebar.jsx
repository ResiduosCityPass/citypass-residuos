import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Icons } from './Icons.jsx';

/**
 * Sidebar de la plataforma CityPass+.
 *
 * Aparecen los ocho modulos de la plataforma, pero solo Residuos es navegable:
 * los demas son de otros squads y todavia no existen. Se muestran deshabilitados
 * en vez de ocultarlos porque el modulo se evalua como parte de CityPass+, y la
 * demo tiene que dejar ver donde encaja. Deshabilitados y con tooltip: presentes,
 * sin prometer nada que no este.
 */

const OTHER_SQUAD_MODULES = [
  { icon: 'home', label: 'Inicio', squad: 'Squad transversal' },
  { icon: 'mobility', label: 'Movilidad', squad: 'Squad 3' },
  { icon: 'complaints', label: 'Reclamos', squad: 'Squad 5' },
  { icon: 'emergencies', label: 'Emergencias', squad: 'Squad 6' },
  { icon: 'spaces', label: 'Espacios Publicos', squad: 'Squad 7' },
  { icon: 'culture', label: 'Cultura y Eventos', squad: 'Squad 8' },
  { icon: 'analytics', label: 'Analitica', squad: 'Squad transversal' },
];

/* Las rutas quedan en castellano: espejan las del backend y las ve el usuario. */
const WASTE_SECTIONS = [
  { to: '/mapa', icon: 'map', label: 'Mapa en vivo' },
  { to: '/contenedores', icon: 'waste', label: 'Contenedores' },
  { to: '/zonas', icon: 'zones', label: 'Zonas y umbrales' },
  { to: '/alertas', icon: 'alerts', label: 'Alertas' },
  { to: '/flota', icon: 'fleet', label: 'Flota' },
  { to: '/choferes', icon: 'profile', label: 'Choferes' },
  { to: '/rutas', icon: 'routes', label: 'Rutas' },
];

/**
 * Las dos pantallas que no son del operador. Van en un bloque aparte y no
 * entre las secciones de arriba porque son otro actor, no otra parte del
 * panel: un ciudadano nunca ve este sidebar y un chofer entra desde el celular.
 * Estan enlazadas igual para que la demo no obligue a tipear URLs.
 */
const OTHER_ACTOR_VIEWS = [
  { to: '/cerca', icon: 'map', label: 'Vista ciudadana' },
  { to: '/chofer', icon: 'routes', label: 'Mi ruta (chofer)' },
];

export default function Sidebar({ openAlerts = 0, open = false, onNavigate }) {
  const closeButton = useRef(null);

  // Al abrir el cajon el foco entra: si se queda en la hamburguesa, el Tab
  // recorre la pantalla tapada por el fondo oscuro antes de llegar al menu.
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  return (
    <nav
      className={`sidebar ${open ? 'open' : ''}`}
      aria-label="Modulos de CityPass+"
    >
      <div className="sidebar-brand">
        <img src="/citypass-logo.png" alt="" className="sidebar-logo" />
        <span>CityPass<strong>+</strong></span>
        {/* Solo se ve en el cajon: en escritorio no hay nada que cerrar. */}
        <button ref={closeButton} type="button" className="sidebar-close" onClick={onNavigate} aria-label="Cerrar el menu">
          <Icons.close />
        </button>
      </div>

      <p className="sidebar-heading">Modulo activo</p>
      <ul className="sidebar-list">
        {WASTE_SECTIONS.map((section) => {
          const Icon = Icons[section.icon];
          return (
            <li key={section.to}>
              <NavLink
                to={section.to}
                onClick={onNavigate}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <Icon />
                <span>{section.label}</span>
                {section.icon === 'alerts' && openAlerts > 0 && (
                  <span className="sidebar-badge">{openAlerts}</span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <p className="sidebar-heading">Otras vistas</p>
      <ul className="sidebar-list">
        {OTHER_ACTOR_VIEWS.map((view) => {
          const Icon = Icons[view.icon];
          return (
            <li key={view.to}>
              <NavLink
                to={view.to}
                onClick={onNavigate}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <Icon />
                <span>{view.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>

      <p className="sidebar-heading">Otros modulos</p>
      <ul className="sidebar-list">
        {OTHER_SQUAD_MODULES.map((module) => {
          const Icon = Icons[module.icon];
          return (
            <li key={module.icon}>
              <span
                className="sidebar-item disabled"
                title={`${module.label} lo desarrolla el ${module.squad}. No es parte de este modulo.`}
                aria-disabled="true"
              >
                <Icon />
                <span>{module.label}</span>
                <Icons.lock />
              </span>
            </li>
          );
        })}
      </ul>

      <footer className="sidebar-footer">
        <span>Squad 4 · Residuos</span>
        <span className="muted">Design System v1.0</span>
      </footer>
    </nav>
  );
}
