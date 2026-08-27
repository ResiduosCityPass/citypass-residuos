import { useEffect, useRef } from 'react';

/**
 * Dialogo modal con overlay, cierre por Escape y foco atrapado adentro.
 *
 * El foco importa mas de lo que parece: sin atraparlo, tabular desde el modal
 * lleva a los botones de la tabla que quedo atras, que siguen siendo clickeables
 * con Enter aunque no se vean.
 */
export default function Modal({ title, width = 480, onClose, closable = true, children, footer }) {
  const box = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && closable) {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !box.current) return;

      const focusable = box.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select, textarea, a[href]',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // El foco va al primer control del CUERPO, no del modal: el primero en orden
    // de DOM es la × de la cabecera, y abrir un formulario con el foco puesto en
    // "cerrar" hace que lo primero que se escriba no vaya a ningun lado.
    const body = box.current?.querySelector('.modal-body');
    (body ?? box.current)?.querySelector('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, closable]);

  return (
    <div className="overlay" onMouseDown={(e) => closable && e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <header className="modal-header">
          <h2>{title}</h2>
          {closable && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
