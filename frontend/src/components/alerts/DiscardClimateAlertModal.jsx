import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';

export default function DiscardClimateAlertModal({ alertId, busy, onClose, onDiscard }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const result = await onDiscard({ accion: 'DESCARTAR', motivo: reason.trim() });
    if (result.ok) onClose();
    else setError(result.message);
  };
  return <Modal title="Descartar alerta climática" onClose={onClose} closable={!busy} footer={<>
    <Button variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button>
    <Button form="discard-climate-alert" type="submit" disabled={busy || reason.trim().length < 10}>
      {busy ? 'Descartando…' : 'Confirmar descarte'}
    </Button>
  </>}>
    <p>La alerta {alertId} pasará al historial y dejará de contar como pendiente. Se conservarán los mensajes recibidos, tu identidad y el motivo.</p>
    <form id="discard-climate-alert" onSubmit={submit}>
      <Field label="Motivo del descarte" htmlFor="discard-climate-reason" required hint="Entre 10 y 300 caracteres.">
        <textarea id="discard-climate-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={300} required disabled={busy} />
      </Field>
      {error && <Notice type="error">{error}</Notice>}
    </form>
  </Modal>;
}
