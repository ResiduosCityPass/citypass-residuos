import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { fieldErrors, generalMessage } from '../../domain/errors.js';

/**
 * Alta y edicion de zona.
 *
 * La zona define a partir de que porcentaje un contenedor se considera critico.
 * En el centro conviene 70; en zonas de baja densidad, 85 alcanza.
 */
export default function ZoneFormModal({ zone, onSave, onClose, neighborhoods = {} }) {
  const editing = Boolean(zone);
  const [values, setValues] = useState({
    nombre: zone?.nombre ?? '',
    barrioIds: zone?.barrioIds ?? [],
    umbralCriticoPct: zone?.umbralCriticoPct ?? 70,
    umbralTemperaturaC: zone?.umbralTemperaturaC ?? 60,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const byField = fieldErrors(error);
  const general = generalMessage(error);
  const change = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const thresholdGoesDown = editing && Number(values.umbralCriticoPct) < zone.umbralCriticoPct;

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        nombre: values.nombre,
        barrioIds: values.barrioIds,
        umbralCriticoPct: Number(values.umbralCriticoPct),
        umbralTemperaturaC: Number(values.umbralTemperaturaC),
      });
    } catch (e) {
      setError(e);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Editar zona ${zone.nombre}` : 'Nueva zona'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="form-zone" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear zona'}
          </Button>
        </>
      }
    >
      <form id="form-zone" onSubmit={submit}>
        {general && <Notice type="error" title={`[${error.code}]`}>{general}</Notice>}

        <Field label="Nombre" htmlFor="nombre" required error={byField.nombre}
               hint="Entre 2 y 80 caracteres. No puede repetirse.">
          <input id="nombre" value={values.nombre} onChange={change('nombre')} maxLength={80} />
        </Field>

        <fieldset className="zone-neighborhoods" disabled={saving || neighborhoods.loading || neighborhoods.error}>
          <legend>Barrios vinculados</legend>
          <p className="muted">Elegí uno o varios barrios del catálogo de Espacios Públicos. Sus coordenadas son de referencia, no límites de la zona.</p>
          {neighborhoods.loading && <p role="status">Cargando barrios…</p>}
          <div className="neighborhood-options">{(neighborhoods.catalog ?? []).map((b) => (
            <label key={b.id}><input type="checkbox" checked={values.barrioIds.includes(b.id)} onChange={(e) => {
              setValues((v) => ({ ...v, barrioIds: e.target.checked ? [...v.barrioIds, b.id] : v.barrioIds.filter((id) => id !== b.id) }));
            }} />{b.nombre}</label>
          ))}</div>
          <p className="muted">Podés dejarla sin vincular y seleccionar la zona manualmente en cada alerta.</p>
          {byField.barrioIds && <p className="text-danger">{byField.barrioIds}</p>}
        </fieldset>
        {neighborhoods.error && <Notice type="warning">No se pudo cargar el catálogo. Se conservan los vínculos existentes y podés editar los demás datos.
          <Button type="button" variant="secondary" onClick={neighborhoods.retry}>Reintentar barrios</Button>
        </Notice>}

        <Field label="Umbral de llenado (%)" htmlFor="umbralCriticoPct" required
               error={byField.umbralCriticoPct}
               hint="A partir de este nivel el contenedor pasa a CRITICO y se genera una alerta de saturación.">
          <input id="umbralCriticoPct" type="number" min={1} max={100}
                 value={values.umbralCriticoPct} onChange={change('umbralCriticoPct')} />
        </Field>

        <Field label="Umbral de temperatura (°C)" htmlFor="umbralTemperaturaC" required
               error={byField.umbralTemperaturaC}
               hint="Por encima de esta temperatura se dispara una alerta de INCENDIO, sin importar el nivel de llenado.">
          <input id="umbralTemperaturaC" type="number" min={20} max={150}
                 value={values.umbralTemperaturaC} onChange={change('umbralTemperaturaC')} />
        </Field>

        {/* El aviso aparece solo cuando el umbral BAJA, que es el caso en el que
            el usuario espera ver contenedores ponerse rojos al instante y no pasa
            nada. Mostrarlo siempre lo convertiria en decorado que nadie lee. */}
        {thresholdGoesDown && (
          <Notice type="warning" title="El cambio no repinta el mapa en el acto">
            Bajar el umbral de {zone.umbralCriticoPct}% a {values.umbralCriticoPct}% no reevalúa
            los contenedores existentes. Cada uno se recalcula recién con su próxima lectura, así
            que pueden pasar minutos hasta que cambien de color.
          </Notice>
        )}
      </form>
    </Modal>
  );
}
