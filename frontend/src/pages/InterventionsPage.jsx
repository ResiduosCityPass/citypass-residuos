import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Table from '../components/ui/Table.jsx';
import Chip from '../components/ui/Chip.jsx';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import { fetchInterventions, completeIntervention } from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';

const formatDate = (iso) =>
  new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * CU-01 de Emergencias · Intervenciones (alternativa A7).
 *
 * Una intervencion no la crea ni la edita nadie de este modulo: nace sola
 * cuando Emergencias resuelve un incidente y marca RESIDUOS entre las causas
 * relacionadas. La pantalla existe para que el operador vea que paso despues:
 * donde fue, si habia un contenedor cerca que la proxima ruta va a levantar, y
 * para cerrarla cuando la cuadrilla ya intervino. Eso ultimo publica
 * `residuos.intervencion.completada`.
 *
 * Las tarjetas son el dashboard del modulo que pide el caso de uso. Se cuentan
 * en el cliente a partir de la lista: son unas pocas filas, y asi no hay un
 * segundo endpoint que pueda discrepar con la tabla de abajo.
 *
 * "Sin contenedor" no es un error. La causa puede ser basura suelta en la
 * calzada: la intervencion se programa igual, solo que no hay nada que rutear.
 */
export default function InterventionsPage() {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [completing, setCompleting] = useState(null);

  const load = useCallback(() => {
    fetchInterventions()
      .then((list) => {
        setInterventions(list);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(
    () => ({
      total: interventions.length,
      withContainer: interventions.filter((i) => i.contenedorId).length,
      withoutContainer: interventions.filter((i) => !i.contenedorId).length,
      completed: interventions.filter((i) => i.estado === 'COMPLETADA').length,
    }),
    [interventions],
  );

  const complete = async (intervention) => {
    setCompleting(intervention.id);
    setError(null);
    try {
      await completeIntervention(intervention.id);
      setSuccess(`La intervención de ${intervention.emergenciaId} quedó completada.`);
      load();
    } catch (e) {
      setError(e);
    } finally {
      setCompleting(null);
    }
  };

  const columns = [
    {
      key: 'emergencia',
      title: 'Emergencia',
      render: (i) => <strong className="mono">{i.emergenciaId}</strong>,
    },
    {
      key: 'lugar',
      title: 'Lugar',
      render: (i) => (
        <span className="mono">
          {Number(i.lat).toFixed(4)}, {Number(i.lng).toFixed(4)}
        </span>
      ),
    },
    {
      key: 'contenedor',
      title: 'Contenedor cercano',
      render: (i) =>
        i.contenedorId ? (
          <Link to={`/contenedores/${i.contenedorId}`}>
            a {i.distanciaMetros} m · ver contenedor
          </Link>
        ) : (
          <Chip variant="neutral" title="No había ningún contenedor a menos de 50 m">
            Sin contenedor
          </Chip>
        ),
    },
    {
      key: 'estado',
      title: 'Estado',
      render: (i) =>
        i.estado === 'COMPLETADA' ? (
          <Chip variant="success" title={i.completadaEn ? `Completada ${formatDate(i.completadaEn)}` : undefined}>
            Completada
          </Chip>
        ) : (
          <Chip variant="warning">Programada</Chip>
        ),
    },
    { key: 'programada', title: 'Programada', render: (i) => formatDate(i.programadaEn) },
    {
      key: 'acciones',
      title: '',
      // Una intervencion completada no se reabre: el backend responde 409.
      render: (i) =>
        i.estado === 'COMPLETADA' ? null : (
          <div className="actions-cell">
            <Button
              variant="secondary"
              size="sm"
              disabled={completing === i.id}
              onClick={() => complete(i)}
            >
              {completing === i.id ? 'Completando…' : 'Marcar completada'}
            </Button>
          </div>
        ),
    },
  ];

  const cards = [
    { label: 'Intervenciones', value: summary.total, hint: 'Programadas por emergencias' },
    { label: 'Con refuerzo', value: summary.withContainer, hint: 'Contenedor a menos de 50 m' },
    { label: 'Sin contenedor cerca', value: summary.withoutContainer, hint: 'Se programan igual' },
    { label: 'Completadas', value: summary.completed, hint: 'La cuadrilla ya intervino' },
  ];

  return (
    <div className="screen">
      <Notice type="info" title="De dónde salen">
        Las programa el sistema cuando Emergencias resuelve un incidente y marca residuos entre
        sus causas. Si había un contenedor a menos de 50 m, la próxima ruta que se genere lo
        incluye aunque no esté crítico.
      </Notice>

      <div className="cards" aria-label="Resumen de intervenciones">
        {cards.map((card) => (
          <div key={card.label} className="card" title={card.hint}>
            <span className="card-number">{card.value}</span>
            <span className="card-label">{card.label}</span>
          </div>
        ))}
      </div>

      {error && (
        <Notice type="error" title={`[${error.code}]`}>
          {generalMessage(error) ?? error.message}
        </Notice>
      )}
      {success && <Notice type="success">{success}</Notice>}

      <Table
        columns={columns}
        rows={interventions}
        loading={loading}
        rowKey={(i) => i.id}
        emptyText="Todavía no hay intervenciones. Aparecen cuando una emergencia se resuelve con causa residuos."
      />
    </div>
  );
}
