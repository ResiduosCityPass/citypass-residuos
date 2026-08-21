/**
 * Los cuatro estados del design system: exito, informacion, advertencia, error.
 *
 * Cada uno lleva su icono ademas del color, porque el color solo no alcanza para
 * quien no distingue verde de rojo.
 */
const ICON = { success: '✓', info: 'i', warning: '!', error: '×' };

export default function Notice({ type = 'info', title, children }) {
  return (
    <div className={`notice notice-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon" aria-hidden="true">{ICON[type]}</span>
      <div>
        {title && <strong className="notice-title">{title}</strong>}
        {children && <div className="notice-body">{children}</div>}
      </div>
    </div>
  );
}
