import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { fieldErrors, generalMessage } from '../../domain/errors.js';

/**
 * Alta y edicion de chofer (CU-09).
 *
 * El backend acepta tambien `usuarioSub`, y aca NO se ofrece a proposito. Es un
 * identificador opaco que nadie tiene en la cabeza: escribirlo a mano es volver
 * a la trampa del `choferId` de texto libre, donde un caracter mal puesto deja
 * al chofer sin ver su ruta y sin ningun error. El acceso se configura de una
 * sola forma, emitiendo la credencial, que genera el sub del lado del servidor.
 */
export default function DriverFormModal({ driver, onSave, onClose }) {
  const editing = Boolean(driver);
  const [values, setValues] = useState(
    editing ? { nombre: driver.nombre, legajo: driver.legajo } : { nombre: '', legajo: '' },
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const byField = fieldErrors(error);
  const general = generalMessage(error);
  const change = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // El backend no recorta: " CH-001" y "CH-001" serian dos legajos distintos
      // y el unico no lo detectaria.
      await onSave({ nombre: values.nombre.trim(), legajo: values.legajo.trim() });
    } catch (e) {
      setError(e);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Editar ${driver.nombre}` : 'Nuevo chofer'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="form-driver" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Dar de alta'}
          </Button>
        </>
      }
    >
      <form id="form-driver" onSubmit={submit}>
        {general && (
          <Notice type="error" title={`[${error.code}]`}>
            {general}
            {/* El unico cuenta tambien a los dados de baja, que no aparecen en
                el listado por defecto: sin esto, el 409 señala un legajo que
                no se ve en ningun lado. */}
            {error.code === 'CHOFER_LEGAJO_DUPLICADO' &&
              '. Puede ser de un chofer dado de baja: tildá "Mostrar dados de baja" para verlo.'}
          </Notice>
        )}

        <Field label="Nombre" htmlFor="nombre" required error={byField.nombre}>
          <input id="nombre" value={values.nombre} onChange={change('nombre')}
                 maxLength={120} placeholder="Juana Perez" />
        </Field>

        <Field label="Legajo" htmlFor="legajo" required error={byField.legajo}
               hint="Distingue a dos choferes que se llaman igual. No puede repetirse.">
          <input id="legajo" className="mono" value={values.legajo} onChange={change('legajo')}
                 maxLength={40} placeholder="CH-014" />
        </Field>

        {!editing && (
          <p className="muted">
            El acceso a su pantalla no se carga acá: se configura emitiéndole una credencial desde
            el listado.
          </p>
        )}
      </form>
    </Modal>
  );
}
