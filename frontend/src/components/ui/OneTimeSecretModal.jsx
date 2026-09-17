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
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS) queda seleccionarlo a mano.
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
