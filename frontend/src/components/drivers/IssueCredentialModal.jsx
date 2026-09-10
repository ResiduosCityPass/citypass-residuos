import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import OneTimeSecretModal from '../ui/OneTimeSecretModal.jsx';
import { issueDriverCredential } from '../../api/waste.js';
import { generalMessage } from '../../domain/errors.js';

/**
 * El `sub` que genera `npm run token:dev -- CHOFER`. Solo existe en el seed de
 * desarrollo, y es el unico caso en que emitir rompe algo que no se ve: le rota
 * el sub a Juana y el token de desarrollo deja de resolver contra nadie.
 */
const DEV_DRIVER_SUB = 'dev-chofer';

/** El backend manda la duracion como la entiende `jsonwebtoken`: "30d". */
const formatExpiry = (value) => {
  const days = /^(\d+)d$/.exec(value ?? '')?.[1];
  return days ? `${days} días` : value;
};

/**
 * Emitir la credencial con la que un chofer entra a /chofer (CU-09 / CU-10).
 *
 * No hay login: esta credencial ES el acceso. Se muestra una sola vez, con el
 * mismo trato que la API key del sensor (ver OneTimeSecretModal).
 *
 * Lo que agrega el primer paso, y por que no se emite con un solo click:
 * emitir ROTA el `usuarioSub` del chofer, y eso mata la credencial que tenia.
 * Es a proposito —asi se resuelve un celular perdido sin dar de baja a nadie—,
 * pero emitir dos veces por error deja al chofer afuera hasta que le pasen la
 * nueva. El aviso va ANTES de apretar, que es cuando todavia se puede no hacerlo.
 */
export default function IssueCredentialModal({ driver, onDone, onClose }) {
  const [credential, setCredential] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const hasAccess = Boolean(driver.usuarioSub);

  const issue = async () => {
    setSending(true);
    setError(null);
    try {
      setCredential(await issueDriverCredential(driver.id));
    } catch (e) {
      setError(e);
    } finally {
      setSending(false);
    }
  };

  const closeForGood = () => {
    onDone();
    onClose();
  };

  /* --- Paso 2: la credencial, una sola vez --------------------------------- */
  if (credential) {
    const expiry = formatExpiry(credential.expiraEn);
    return (
      <OneTimeSecretModal
        title={`Credencial de ${credential.nombre}`}
        secret={credential.token}
        warningTitle="Esta credencial se muestra una sola vez"
        warning={
          <>
            El backend no la guarda: si cerrás sin copiarla, hay que emitir otra. Quien la tenga
            entra como {credential.nombre} durante {expiry}, así que pasásela solo a esa persona.
          </>
        }
        confirmLabel="Guardé la credencial o ya se la pasé al chofer"
        closeReason="Confirmá que guardaste la credencial antes de cerrar"
        onClose={closeForGood}
      >
        <dl className="data-list">
          <dt>Chofer</dt>
          <dd>
            {credential.nombre} · <span className="mono">{credential.legajo}</span>
          </dd>
          <dt>Vence</dt>
          <dd>En {expiry}</dd>
          <dt>Se usa en</dt>
          <dd>
            La pantalla <code className="mono">/chofer</code>, desde su celular: la pega en la caja
            de credencial y queda guardada en ese navegador.
          </dd>
        </dl>
      </OneTimeSecretModal>
    );
  }

  /* --- Paso 1: confirmar, sabiendo que la anterior muere -------------------- */
  return (
    <Modal
      title={`Credencial para ${driver.nombre}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant={hasAccess ? 'warning' : 'primary'} onClick={issue} disabled={sending}>
            {sending ? 'Emitiendo…' : hasAccess ? 'Emitir otra credencial' : 'Emitir credencial'}
          </Button>
        </>
      }
    >
      {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}

      <p>
        Es cómo entra {driver.nombre} a su pantalla: no hay login. Se muestra una sola vez y dura
        30 días.
      </p>

      {hasAccess ? (
        <Notice type="warning" title="Ya tiene una credencial">
          Emitir otra anula la que tiene, en el acto. Sirve si perdió el celular; si es un error,
          queda afuera hasta que le pases la nueva.
        </Notice>
      ) : (
        <Notice type="info">
          Hoy no tiene acceso: se le pueden asignar rutas, pero no las ve.
        </Notice>
      )}

      {driver.usuarioSub === DEV_DRIVER_SUB && (
        <Notice type="warning" title="Es el chofer del token de desarrollo">
          Después de emitir, el token de <code className="mono">npm run token:dev -- CHOFER</code>{' '}
          deja de servir para esta persona. Usá uno o el otro, no los dos.
        </Notice>
      )}
    </Modal>
  );
}
