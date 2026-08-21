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
  { to: '/mapa', icon: 'map', label: 'Mapa en vivo', useCase: 'CU-07' },
  { to: '/contenedores', icon: 'waste', label: 'Contenedores', useCase: 'CU-01' },
  { to: '/zonas', icon: 'zones', label: 'Zonas y umbrales', useCase: 'CU-02' },
  { to: '/alertas', icon: 'alerts', label: 'Alertas', useCase: 'CU-05/06' },
  { to: '/flota', icon: 'fleet', label: 'Flota', useCase: 'CU-03' },
  { to: '/rutas', icon: 'routes', label: 'Rutas', useCase: 'CU-08/09' },
];

export default function Sidebar({ openAlerts = 0 }) {
  return (
    <nav className="sidebar" aria-label="Modulos de CityPass+">
      <div className="sidebar-brand">
        <span className="sidebar-logo" aria-hidden="true">◉</span>
        <span>CityPass<strong>+</strong></span>
      </div>

      <p className="sidebar-heading">Modulo activo</p>
      <ul className="sidebar-list">
        {WASTE_SECTIONS.map((section) => {
          const Icon = Icons[section.icon];
          return (
            <li key={section.to}>
              <NavLink to={section.to} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                <Icon />
                <span>{section.label}</span>
                {section.icon === 'alerts' && openAlerts > 0 && (
                  <span className="sidebar-badge">{openAlerts}</span>
                )}
                <span className="sidebar-cu">{section.useCase}</span>
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
