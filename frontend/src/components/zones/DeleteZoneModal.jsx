import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';

/**
 * Borrado de zona.
 *
 * A diferencia del contenedor, la zona se borra de verdad. Y falla con
 * 409 ZONA_CON_CONTENEDORES si todavia tiene contenedores asignados: el mensaje
 * del backend dice cuantos, y se muestra tal cual porque eso es lo accionable.
 * "No se puede borrar" a secas obliga a ir a buscar el motivo a otra pantalla.
 */
export default function DeleteZoneModal({ zone, onConfirm, onClose }) {
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const confirm = async () => {
    setSending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e);
      setSending(false);
    }
  };

  const blockedByContainers = error?.code === 'ZONA_CON_CONTENEDORES';

  return (
    <Modal
      title={`Borrar zona ${zone.nombre}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {blockedByContainers ? 'Entendido' : 'Cancelar'}
          </Button>
          {!blockedByContainers && (
            <Button variant="danger" onClick={confirm} disabled={sending}>
              {sending ? 'Borrando…' : 'Borrar zona'}
            </Button>
          )}
        </>
      }
    >
      {blockedByContainers ? (
        <Notice type="warning" title="No se puede borrar todavía">
          {error.message}. Reasignálos a otra zona o dalos de baja, y volvé a intentar.
        </Notice>
      ) : (
        <>
          {error && <Notice type="error" title={`[${error.code}]`}>{error.message}</Notice>}
          <p>
            Se borra la zona <strong>{zone.nombre}</strong> y sus umbrales
            ({zone.umbralCriticoPct}% de llenado, {zone.umbralTemperaturaC} °C).
          </p>
          <p className="muted">
            Solo se puede borrar si no tiene ningún contenedor asignado.
          </p>
        </>
      )}
    </Modal>
  );
}
