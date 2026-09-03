import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { generalMessage } from '../../domain/errors.js';

/**
 * Confirmacion de baja de contenedor.
 *
 * Aclara que la baja es LOGICA porque cambia la decision: si el usuario cree que
 * borra el historico, no da de baja un contenedor roto y lo deja ensuciando el
 * mapa. El historico de lecturas es la fuente de datos del modelo predictivo de
 * CU-12, y por eso la fila sobrevive.
 */
export default function DeleteContainerModal({ container, onConfirm, onClose }) {
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

  return (
    <Modal
      title={`Dar de baja ${container.codigo}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={confirm} disabled={sending}>
            {sending ? 'Dando de baja…' : 'Dar de baja'}
          </Button>
        </>
      }
    >
      {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}

      <p>
        <strong className="mono">{container.codigo}</strong> deja de aparecer en los listados y en
        el mapa.
      </p>

      <Notice type="info" title="Es una baja lógica">
        El histórico de lecturas se conserva: es la fuente de datos del modelo predictivo de CU-12.
        No se borra nada de la base.
      </Notice>
    </Modal>
  );
}
