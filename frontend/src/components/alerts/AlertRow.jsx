import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Chip from '../ui/Chip.jsx';
import {
  ALERT_TYPE_LABEL,
  ALERT_STATE_LABEL,
  ALERT_STATE_CLASS,
  SEVERITY_LABEL,
  timeAgo,
  canAcknowledge,
  canResolve,
} from '../../domain/states.js';

const CHIP_BY_SEVERITY = {
  BAJA: 'neutral',
  MEDIA: 'info',
  ALTA: 'warning',
  CRITICA: 'danger',
};

/**
 * Una alerta con sus dos acciones.
 *
 * La maquina de estados manda: Atender solo se habilita en ABIERTA, y Resolver
 * en ABIERTA o EN_ATENCION. Los botones se deshabilitan con el motivo escrito en
 * el tooltip en vez de dejar que el usuario haga click y se coma un 409
 * ALERTA_NO_ABIERTA. El backend valida igual; esto es para que no haga falta.
 */
export default function AlertRow({ alert, containerCode, onAction }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const run = async (action) => {
    setSending(true);
    setError(null);
    try {
      await onAction(action, alert.id);
    } catch (e) {
      setError(e);
      setSending(false);
    }
  };

  return (
    <li className={`alert alert-${ALERT_STATE_CLASS[alert.estado]}`}>
      <div className="alert-header">
        <strong>{ALERT_TYPE_LABEL[alert.tipo]}</strong>
        <Chip variant={CHIP_BY_SEVERITY[alert.severidad]}>{SEVERITY_LABEL[alert.severidad]}</Chip>
        <Chip variant="neutral">{ALERT_STATE_LABEL[alert.estado]}</Chip>
        {containerCode && <span className="mono muted">{containerCode}</span>}
        <span className="muted alert-date">{timeAgo(alert.detectadaEn)}</span>
      </div>

      {/* `detalle` viene ya redactado por el backend para el operador. Se muestra
          tal cual: reescribirlo del lado del cliente lo desincroniza el dia que
          cambie la regla que lo genera. */}
      <p className="alert-detail">{alert.detalle}</p>

      {error && <p className="field-error" role="alert">[{error.code}] {error.message}</p>}

      <div className="alert-actions">
        <Button
          size="sm"
          variant="secondary"
          disabled={!canAcknowledge(alert) || sending}
          disabledReason={`Solo se puede atender una alerta ABIERTA. Esta está ${alert.estado}.`}
          onClick={() => run('acknowledge')}
        >
          Atender
        </Button>
        <Button
          size="sm"
          variant="success"
          disabled={!canResolve(alert) || sending}
          disabledReason="Esta alerta ya fue resuelta."
          onClick={() => run('resolve')}
        >
          Resolver
        </Button>
        {alert.resueltaEn && (
          <span className="muted">resuelta {timeAgo(alert.resueltaEn)}</span>
        )}
      </div>
    </li>
  );
}
