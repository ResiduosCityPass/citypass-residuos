import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { fieldErrors, generalMessage } from '../../domain/errors.js';
import { WASTE_TYPE_LABEL, TRUCK_STATE_LABEL } from '../../domain/states.js';

const EMPTY = { patente: '', capacidadLitros: 12000, tipoResiduoHabilitado: 'COMUN', estado: 'DISPONIBLE' };

/**
 * Alta y edicion de camion (CU-03).
 *
 * `tipoResiduoHabilitado` no es un dato decorativo: es lo que decide que
 * contenedores puede levantar este camion cuando se genera una ruta (CU-08).
 * Un camion de RECICLABLE nunca va a aparecer para una ruta de ORGANICO.
 */
export default function TruckFormModal({ truck, onSave, onClose }) {
  const editing = Boolean(truck);
  const [values, setValues] = useState(
    editing
      ? {
          patente: truck.patente,
          capacidadLitros: truck.capacidadLitros,
          tipoResiduoHabilitado: truck.tipoResiduoHabilitado,
          estado: truck.estado,
        }
      : { ...EMPTY },
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const byField = fieldErrors(error);
  const general = generalMessage(error);
  const change = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const onRoute = editing && truck.estado === 'EN_RUTA';

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // En el alta el estado no se elige: todo camion nuevo nace DISPONIBLE.
      const { estado: _ignored, ...rest } = values;
      await onSave(editing ? values : rest);
    } catch (e) {
      setError(e);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Editar ${truck.patente}` : 'Nuevo camion'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="form-truck" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear camion'}
          </Button>
        </>
      }
    >
      <form id="form-truck" onSubmit={submit}>
        {general && <Notice type="error" title={`[${error.code}]`}>{general}</Notice>}

        <Field label="Patente" htmlFor="patente" required error={byField.patente}
               hint="Se guarda en mayusculas. No puede repetirse.">
          <input id="patente" className="mono" value={values.patente}
                 onChange={change('patente')} maxLength={10} placeholder="AB123CD" />
        </Field>

        <Field label="Capacidad (litros)" htmlFor="capacidadLitros" required
               error={byField.capacidadLitros}
               hint="Es el tope que respeta la heuristica de ruteo al armar una ruta.">
          <input id="capacidadLitros" type="number" min={1000} max={40000} step={500}
                 value={values.capacidadLitros} onChange={change('capacidadLitros')} />
        </Field>

        <Field label="Residuo habilitado" htmlFor="tipoResiduoHabilitado" required
               error={byField.tipoResiduoHabilitado}
               hint="Este camion solo puede rutear contenedores de este tipo.">
          <select id="tipoResiduoHabilitado" value={values.tipoResiduoHabilitado}
                  onChange={change('tipoResiduoHabilitado')}>
            {Object.entries(WASTE_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>

        {editing && (
          <Field label="Estado" htmlFor="estado" error={byField.estado}
                 hint={onRoute
                   ? 'Está en ruta: primero hay que cerrar o cancelar su ruta.'
                   : 'Un camión en mantenimiento no aparece al generar rutas.'}>
            <select id="estado" value={values.estado} onChange={change('estado')} disabled={onRoute}>
              {Object.entries(TRUCK_STATE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
        )}
      </form>
    </Modal>
  );
}
