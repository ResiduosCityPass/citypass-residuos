import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { fieldErrors, generalMessage } from '../../domain/errors.js';
import { WASTE_TYPE_LABEL } from '../../domain/states.js';

const EMPTY = { codigo: '', zonaId: '', tipoResiduo: 'COMUN', capacidadLitros: 1100, lat: '', lng: '' };

/**
 * Alta y edicion de contenedor. Es el mismo formulario para las dos cosas: los
 * campos son identicos y duplicarlo garantiza que en tres sprints uno tenga una
 * validacion que el otro no.
 *
 * La unica diferencia es `codigo`, que en edicion se deshabilita: el backend no
 * lo acepta en el PATCH porque es el identificador operativo del contenedor, el
 * que esta pegado con una calcomania en la tapa.
 */
export default function ContainerFormModal({ container, zones, onSave, onClose }) {
  const editing = Boolean(container);
  const [values, setValues] = useState(
    editing
      ? {
          codigo: container.codigo,
          zonaId: container.zonaId,
          tipoResiduo: container.tipoResiduo,
          capacidadLitros: container.capacidadLitros,
          lat: container.lat,
          lng: container.lng,
        }
      : { ...EMPTY, zonaId: zones[0]?.id ?? '' },
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
      // En edicion se mandan solo los campos editables; `codigo` nunca viaja.
      const { codigo, ...rest } = values;
      await onSave(editing ? rest : { ...rest, ...(codigo ? { codigo } : {}) });
    } catch (e) {
      setError(e);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Editar ${container.codigo}` : 'Nuevo contenedor'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="form-container" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear contenedor'}
          </Button>
        </>
      }
    >
      <form id="form-container" onSubmit={submit}>
        {general && <Notice type="error" title={`[${error.code}]`}>{general}</Notice>}

        <Field
          label="Codigo"
          htmlFor="codigo"
          error={byField.codigo}
          hint={
            editing
              ? 'No se puede modificar: es el identificador operativo del contenedor.'
              : 'Opcional. Si lo dejas vacio, el backend genera CT-0001, CT-0002…'
          }
        >
          <input
            id="codigo"
            className="mono"
            value={values.codigo}
            onChange={change('codigo')}
            disabled={editing}
            placeholder="se genera automaticamente"
            maxLength={20}
          />
        </Field>

        <Field label="Zona" htmlFor="zonaId" required error={byField.zonaId}
               hint="La zona define el umbral a partir del cual este contenedor pasa a critico.">
          <select id="zonaId" value={values.zonaId} onChange={change('zonaId')}>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.nombre} — umbral {zone.umbralCriticoPct}%
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo de residuo" htmlFor="tipoResiduo" required error={byField.tipoResiduo}>
          <select id="tipoResiduo" value={values.tipoResiduo} onChange={change('tipoResiduo')}>
            {Object.entries(WASTE_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>

        <Field label="Capacidad (litros)" htmlFor="capacidadLitros" required error={byField.capacidadLitros}>
          <input id="capacidadLitros" type="number" min={1} max={100000}
                 value={values.capacidadLitros} onChange={change('capacidadLitros')} />
        </Field>

        <div className="two-col">
          <Field label="Latitud" htmlFor="lat" required error={byField.lat}>
            <input id="lat" className="mono" value={values.lat} onChange={change('lat')} placeholder="-34.6037" />
          </Field>
          <Field label="Longitud" htmlFor="lng" required error={byField.lng}>
            <input id="lng" className="mono" value={values.lng} onChange={change('lng')} placeholder="-58.3816" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
