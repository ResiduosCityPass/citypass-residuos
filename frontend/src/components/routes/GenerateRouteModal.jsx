import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import { generalMessage } from '../../domain/errors.js';
import { WASTE_TYPE_LABEL, isTruckAvailable } from '../../domain/states.js';

/**
 * CU-08 · Generar una propuesta de ruta.
 *
 * Solo se ofrecen camiones DISPONIBLES. Los que estan en ruta o en
 * mantenimiento no se ocultan del todo: se dice cuantos quedaron afuera y por
 * que, porque "no aparece mi camion" es la pregunta que sigue.
 */
export default function GenerateRouteModal({ trucks, zones, onGenerate, onClose }) {
  const available = trucks.filter(isTruckAvailable);
  const [values, setValues] = useState({ camionId: available[0]?.id ?? '', zonaId: '' });
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  const change = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const selected = available.find((t) => t.id === values.camionId);
  const unavailable = trucks.length - available.length;

  const submit = async (event) => {
    event.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      await onGenerate({ camionId: values.camionId, ...(values.zonaId ? { zonaId: values.zonaId } : {}) });
    } catch (e) {
      setError(e);
      setGenerating(false);
    }
  };

  return (
    <Modal
      title="Generar ruta"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="form-route" type="submit" disabled={generating || available.length === 0}
                  disabledReason="No hay ningún camión disponible">
            {generating ? 'Calculando…' : 'Generar propuesta'}
          </Button>
        </>
      }
    >
      <form id="form-route" onSubmit={submit}>
        {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}

        {available.length === 0 ? (
          <Notice type="warning" title="No hay camiones disponibles">
            Todos los camiones están en ruta o en mantenimiento. Revisá la flota antes de generar.
          </Notice>
        ) : (
          <>
            <Field label="Camion" htmlFor="camionId" required
                   hint={unavailable > 0
                     ? `${unavailable} camión(es) no aparecen: están en ruta o en mantenimiento.`
                     : undefined}>
              <select id="camionId" value={values.camionId} onChange={change('camionId')}>
                {available.map((truck) => (
                  <option key={truck.id} value={truck.id}>
                    {truck.patente} — {WASTE_TYPE_LABEL[truck.tipoResiduoHabilitado]} · {truck.capacidadLitros.toLocaleString('es-AR')} L
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Zona" htmlFor="zonaId"
                   hint="Opcional. Sin zona, la heurística busca en toda la ciudad.">
              <select id="zonaId" value={values.zonaId} onChange={change('zonaId')}>
                <option value="">Todas las zonas</option>
                {zones.filter((z) => !z.bloqueada).map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.nombre}</option>
                ))}
              </select>
            </Field>

            {selected && (
              <Notice type="info" title="Qué va a hacer">
                Busca contenedores en estado <strong>CRÍTICO</strong> de tipo{' '}
                {WASTE_TYPE_LABEL[selected.tipoResiduoHabilitado]} que no estén ya en otra ruta, y
                los ordena por cercanía sin pasarse de los{' '}
                {selected.capacidadLitros.toLocaleString('es-AR')} L del camión. Las zonas
                bloqueadas quedan afuera. <strong>La ruta queda como propuesta</strong>: no se
                asigna hasta que la confirmes.
              </Notice>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
