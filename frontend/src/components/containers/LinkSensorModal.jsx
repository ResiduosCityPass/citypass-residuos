import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import OneTimeSecretModal from '../ui/OneTimeSecretModal.jsx';
import { linkSensor } from '../../api/waste.js';
import { generalMessage } from '../../domain/errors.js';

/**
 * Vincular sensor a un contenedor y mostrar su API key.
 *
 * ESTA ES LA PANTALLA MAS DELICADA DEL MODULO.
 *
 * El backend guarda solo el hash de la apiKey: la devuelve una vez y despues no
 * existe en ningun lado. Si el usuario cierra este modal sin copiarla, la unica
 * salida es desvincular el sensor y volver a vincularlo.
 *
 * La clave se muestra con OneTimeSecretModal, que es donde viven las tres
 * decisiones que no son adorno: bloque monoespaciado, boton de copiar, y que no
 * se cierre hasta confirmar que se guardo. Lo comparte con la credencial del
 * chofer, que tiene el mismo problema.
 */
export default function LinkSensorModal({ container, onDone, onClose }) {
  const [code, setCode] = useState('');
  const [credential, setCredential] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const link = async (event) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      setCredential(await linkSensor(container.id, code ? { codigo: code } : {}));
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

  /* --- Paso 2: la clave, una sola vez -------------------------------------- */
  if (credential) {
    return (
      <OneTimeSecretModal
        title={`Sensor ${credential.codigo} vinculado`}
        secret={credential.apiKey}
        warningTitle="Esta clave se muestra una sola vez"
        warning={
          <>
            El backend guarda únicamente su hash. Si cerrás sin copiarla, la única salida es
            desvincular el sensor y volver a vincularlo. Tratala como una clave de AWS.
          </>
        }
        confirmLabel="Guardé la API key en un lugar seguro"
        closeReason="Confirmá que guardaste la API key antes de cerrar"
        onClose={closeForGood}
      >
        <dl className="data-list">
          <dt>Sensor</dt>
          <dd className="mono">{credential.codigo}</dd>
          <dt>Contenedor</dt>
          <dd className="mono">{container.codigo}</dd>
          <dt>Se usa en</dt>
          <dd>
            El header <code className="mono">X-Sensor-Key</code> de{' '}
            <code className="mono">POST /lecturas</code>. No es un JWT: un sensor es un
            dispositivo, no una persona con sesión.
          </dd>
        </dl>
      </OneTimeSecretModal>
    );
  }

  /* --- Paso 1: pedir el codigo --------------------------------------------- */
  return (
    <Modal
      title={`Vincular sensor a ${container.codigo}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="form-sensor" type="submit" disabled={sending}>
            {sending ? 'Vinculando…' : 'Vincular sensor'}
          </Button>
        </>
      }
    >
      <form id="form-sensor" onSubmit={link}>
        {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}

        <Notice type="info">
          Al vincular se genera una API key. Vas a poder verla una única vez, en la pantalla
          siguiente. Tené a mano dónde guardarla antes de continuar.
        </Notice>

        <Field
          label="Codigo del sensor"
          htmlFor="codigo-sensor"
          hint="Opcional. Si lo dejás vacío, el backend genera SN-0001, SN-0002…"
        >
          <input
            id="codigo-sensor"
            className="mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="se genera automaticamente"
            maxLength={20}
          />
        </Field>
      </form>
    </Modal>
  );
}
