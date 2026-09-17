import { useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import Notice from './Notice.jsx';

/**
 * Un secreto que el backend entrega UNA SOLA VEZ: la API key de un sensor
 * (CU-01) y la credencial de un chofer (CU-09).
 *
 * Vive en un solo lugar para que las dos pantallas no puedan divergir. Son el
 * mismo problema —si se cierra sin copiarlo, no hay forma de volver a verlo— y
 * llevan la misma friccion, que no es adorno:
 *   - el secreto va en un bloque grande y monoespaciado, no en una fila de
 *     tabla ni en un toast que se va solo;
 *   - hay un boton de copiar, porque seleccionar a mano un string largo se hace
 *     mal una de cada tres veces;
 *   - no hay × ni Escape: la unica salida es confirmar que se guardo. Es la
 *     unica friccion deliberada de toda la aplicacion.
 */
export default function OneTimeSecretModal({
  title,
  secret,
  warningTitle,
  warning,
  confirmLabel,
  closeReason,
  onClose,
  children,
}) {
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  // null = todavia no intento copiar; true = copiado; false = fallo.
  const [copied, setCopied] = useState(null);

  /**
   * El fallo se AVISA, no se traga. Sin permiso de portapapeles el boton se
   * quedaba diciendo "Copiar" y no pasaba nada visible: quien copia cree que
   * copio, cierra el modal —que no se puede reabrir— y el secreto se perdio.
   * Pasa en el navegador integrado y en cualquier origen que no sea seguro.
   */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      title={title}
      width={560}
      closable={false}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          onClick={onClose}
          disabled={!confirmedSaved}
          disabledReason={closeReason}
        >
          Ya la guardé, cerrar
        </Button>
      }
    >
      <Notice type="warning" title={warningTitle}>{warning}</Notice>

      <div className="key-box">
        <code className="mono key-value">{secret}</code>
        <Button variant={copied ? 'success' : 'secondary'} onClick={copy}>
          {copied ? '✓ Copiada' : 'Copiar'}
        </Button>
      </div>

      {copied === false && (
        <Notice type="warning" title="No se pudo copiar al portapapeles">
          El navegador no dio permiso. Seleccioná el texto de arriba y copialo a mano
          antes de cerrar.
        </Notice>
      )}

      {children}

      <label className="confirm-check">
        <input
          type="checkbox"
          checked={confirmedSaved}
          onChange={(e) => setConfirmedSaved(e.target.checked)}
        />
        <span>{confirmLabel}</span>
      </label>
    </Modal>
  );
}
