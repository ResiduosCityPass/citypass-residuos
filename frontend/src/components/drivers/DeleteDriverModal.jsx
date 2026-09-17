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
 * siguiente —lo busca con `activo: true`—.
 *
 * Las dos cosas que la volvian delicada ya las cubre el backend, y aca cambian
 * de lugar en vez de desaparecer:
 *
 *  - Ruta ASIGNADA o EN_CURSO: ahora la baja se rechaza con 409
 *    CHOFER_CON_RUTA_ACTIVA. El aviso previo se queda igual, porque avisar
 *    antes es mejor que chocar contra el error: el operador ve por que no va a
 *    poder y que tiene que cerrar primero, sin apretar un boton que falla.
 *  - Ya tiene vuelta: `PATCH /choferes/:id/reactivar` la deshace, y como la baja
 *    no toca el `usuarioSub`, el chofer vuelve con la credencial que tenia.
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
      // Es un aviso, no la validacion: quien decide es el backend, que responde
      // 409 CHOFER_CON_RUTA_ACTIVA. Si el listado falla, el modal no se traba
      // por eso; como mucho el operador se entera al confirmar.
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

  // El 409 de la ruta activa no es una falla que convenga reintentar: hasta que
  // la ruta cierre, el boton solo puede volver a fallar.
  const blocked = error?.code === 'CHOFER_CON_RUTA_ACTIVA';

  return (
    <Modal
      title={`Dar de baja a ${driver.nombre}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{blocked ? 'Entendido' : 'Cancelar'}</Button>
          {!blocked && (
            <Button variant="danger" onClick={confirm} disabled={sending}>
              {sending ? 'Dando de baja…' : 'Dar de baja'}
            </Button>
          )}
        </>
      }
    >
      {blocked ? (
        <Notice type="error" title="No se puede dar de baja todavía">
          {error.message} Cerrá o terminá esa ruta desde Rutas y volvé a intentarlo. Si lo diéramos
          de baja ahora, no podría cerrar sus paradas y el camión quedaría en ruta para siempre.
        </Notice>
      ) : (
        error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>
      )}

      <p>
        <strong>{driver.nombre}</strong> <span className="mono">({driver.legajo})</span> deja de
        aparecer al asignar rutas y pierde el acceso a su pantalla en el acto.
      </p>

      {liveRoute && !blocked && (
        <Notice type="warning" title="Tiene una ruta sin terminar">
          Está a cargo de la ruta del camión{' '}
          <span className="mono">{liveRoute.camion?.patente ?? '—'}</span>, que está{' '}
          {ROUTE_STATE_LABEL[liveRoute.estado].toLowerCase()}. El backend no va a dejar darlo de
          baja hasta que esa ruta cierre: sin acceso no puede cerrar sus paradas y el camión
          quedaría en ruta para siempre.
        </Notice>
      )}

      <Notice type="info" title="Es una baja lógica, y se puede deshacer">
        Las rutas que ya hizo lo siguen nombrando: son el registro de quién ejecutó cada
        recolección. Su legajo queda tomado, y si te equivocaste podés reactivarlo desde el
        listado: vuelve con la misma credencial, sin emitir otra.
      </Notice>
    </Modal>
  );
}
