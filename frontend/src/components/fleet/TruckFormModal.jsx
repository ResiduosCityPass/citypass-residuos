import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { fieldErrors, generalMessage } from '../../domain/errors.js';
import { WASTE_TYPE_LABEL, TRUCK_STATE_LABEL, TRUCK_STATE_SELECTABLE } from '../../domain/states.js';

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
      // El `estado` viaja solo cuando se puede elegir. En el alta no se elige:
      // todo camion nace DISPONIBLE. Y en un camion EN_RUTA tampoco, porque el
      // backend solo acepta DISPONIBLE o MANTENIMIENTO y reenviarle su propio
      // EN_RUTA le daria un 400 al guardar un cambio de patente o capacidad.
      const { estado: _ignored, ...rest } = values;
      await onSave(editing && !onRoute ? values : rest);
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

        {/* EN_RUTA no se ofrece: lo pone la asignacion de ruta (CU-09) y lo saca
            la ultima confirmacion de parada (CU-10). Mandarlo a mano da 400. El
            camion que YA esta en ruta muestra su estado, pero deshabilitado. */}
        {editing && (
          <Field label="Estado" htmlFor="estado" error={byField.estado}
                 hint={onRoute
                   ? 'Está en ruta: lo libera la última parada que confirme el chofer.'
                   : 'Un camión en mantenimiento no aparece al generar rutas.'}>
            <select id="estado" value={values.estado} onChange={change('estado')} disabled={onRoute}>
              {(onRoute ? ['EN_RUTA'] : TRUCK_STATE_SELECTABLE).map((value) => (
                <option key={value} value={value}>{TRUCK_STATE_LABEL[value]}</option>
              ))}
            </select>
          </Field>
        )}
      </form>
    </Modal>
  );
}
