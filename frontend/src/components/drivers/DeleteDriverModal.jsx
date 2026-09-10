import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { fetchRoutes } from '../../api/waste.js';
import { generalMessage } from '../../domain/errors.js';
import { ROUTE_STATE_LABEL, isRouteLive } from '../../domain/states.js';

/**
 * Baja de chofer (CU-09).
 *
 * La baja es la forma de REVOCAR el acceso: sin login no hay sesion que cerrar,
 * asi que el backend deja de reconocer la credencial del chofer en el pedido
 * siguiente. Eso es lo que la vuelve delicada, por dos cosas que el backend no
 * frena y que por eso se avisan aca:
 *
 *  - Si tiene una ruta ASIGNADA o EN_CURSO, deja de verla y no puede cerrar las
 *    paradas que le quedan. El backend no lo impide.
 *  - No tiene vuelta: el contrato no tiene reactivacion, y el legajo queda
 *    tomado —el unico cuenta a los dados de baja—, asi que tampoco se lo puede
 *    volver a dar de alta con el mismo.
 */
export default function DeleteDriverModal({ driver, onConfirm, onClose }) {
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [liveRoute, setLiveRoute] = useState(null);

  useEffect(() => {
    let current = true;
    fetchRoutes()
      .then((routes) => {
        if (current) setLiveRoute(routes.find((r) => r.choferId === driver.id && isRouteLive(r)) ?? null);
      })
      // Es un aviso, no una condicion: si el listado falla la baja se puede
      // hacer igual —el backend no la bloquea— y el modal no tiene por que
      // trabarse por eso.
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [driver.id]);

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
      title={`Dar de baja a ${driver.nombre}`}
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
        <strong>{driver.nombre}</strong> <span className="mono">({driver.legajo})</span> deja de
        aparecer al asignar rutas y pierde el acceso a su pantalla en el acto.
      </p>

      {liveRoute && (
        <Notice type="warning" title="Tiene una ruta sin terminar">
          Está a cargo de la ruta del camión{' '}
          <span className="mono">{liveRoute.camion?.patente ?? '—'}</span>, que está{' '}
          {ROUTE_STATE_LABEL[liveRoute.estado].toLowerCase()}. Si lo das de baja ahora, deja de
          verla y no puede cerrar las paradas que le quedan.
        </Notice>
      )}

      <Notice type="info" title="Es una baja lógica, y no tiene vuelta">
        Las rutas que ya hizo lo siguen nombrando: son el registro de quién ejecutó cada
        recolección. No se puede reactivar, y su legajo queda tomado.
      </Notice>
    </Modal>
  );
}
