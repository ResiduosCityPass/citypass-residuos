import { useRef, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { simulateContainerReading } from '../../api/waste.js';
import { generalMessage } from '../../domain/errors.js';

export default function SimulateReadingModal({ container, onDone, onClose }) {
  const [level, setLevel] = useState(String(container.nivelLlenadoPct));
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const percentage = Number(level);
  const valid = level.trim() !== '' && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
    && Math.abs(percentage * 100 - Math.round(percentage * 100)) < 1e-8;

  const submit = async (event) => {
    event.preventDefault();
    if (!confirmed || !valid || pending.current) return;
    pending.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await simulateContainerReading(container.id, { nivelLlenadoPct: percentage, confirmar: true });
      onDone(result);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      pending.current = false;
      setSending(false);
    }
  };

  return <Modal title={`Simular lectura de ${container.codigo}`} onClose={onClose} closable={!sending} footer={<>
    <Button variant="secondary" disabled={sending} onClick={onClose}>Cancelar</Button>
    <Button form="simulate-container-reading" type="submit" disabled={sending || !confirmed || !valid}>
      {sending ? 'Registrando…' : 'Confirmar y registrar lectura'}
    </Button>
  </>}>
    <Notice type="warning" title="Esta prueba cambia los datos del contenedor">
      La lectura quedará en el historial y podrá generar alertas, publicar eventos y cambiar su prioridad para las rutas.
      Registrar 0% no confirma un vaciado ni completa una recuperación: eso lo hace el chofer desde su ruta.
    </Notice>
    <form id="simulate-container-reading" className="simulate-reading-form" onSubmit={submit}>
      <Field label="Nivel de llenado (%)" htmlFor="simulated-fill-level" required hint="De 0 a 100, con hasta dos decimales.">
        <input id="simulated-fill-level" type="number" min="0" max="100" step="0.01" required disabled={sending}
          value={level} onChange={(e) => { setLevel(e.target.value); setConfirmed(false); }} />
      </Field>
      <p className="muted">Se usará el sensor {container.sensor.codigo}, con {container.temperaturaC ?? 20} °C
        {container.temperaturaC == null ? ' (valor inicial, sin mediciones previas)' : ''} y {container.sensor.bateriaPct ?? 100}% de batería
        {container.sensor.bateriaPct == null ? ' (valor inicial)' : ''}.</p>
      <label className="check-row">
        <input type="checkbox" checked={confirmed} disabled={sending} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>Confirmo registrar {valid ? `${percentage}%` : 'esta lectura'} en {container.codigo} y generar los efectos correspondientes.</span>
      </label>
      {error && <Notice type="error" title="No se pudo registrar la lectura">{generalMessage(error) ?? error.message}</Notice>}
    </form>
  </Modal>;
}
