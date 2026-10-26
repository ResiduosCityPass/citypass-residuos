import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Table from '../components/ui/Table.jsx';
import Chip from '../components/ui/Chip.jsx';
import Notice from '../components/ui/Notice.jsx';
import { fetchInterventions } from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';

const formatDate = (iso) =>
  new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * CU-01 de Emergencias · Intervenciones (alternativa A7).
 *
 * Solo lectura, y a proposito: una intervencion no la crea ni la edita nadie de
 * este modulo. Nace sola cuando Emergencias resuelve un incidente y marca
 * RESIDUOS entre las causas relacionadas. La pantalla existe para que el
 * operador vea que pasa despues de eso: donde fue, y si habia un contenedor
 * cerca que la proxima ruta va a levantar.
 *
 * "Sin contenedor" no es un error. La causa puede ser basura suelta en la
 * calzada: la intervencion se programa igual, solo que no hay nada que rutear.
 */
export default function InterventionsPage() {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchInterventions()
      .then((list) => {
        setInterventions(list);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

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
      render: (i) => <Chip variant="warning">{i.estado}</Chip>,
    },
    { key: 'programada', title: 'Programada', render: (i) => formatDate(i.programadaEn) },
  ];

  return (
    <div className="screen">
      <Notice type="info" title="De dónde salen">
        Las programa el sistema cuando Emergencias resuelve un incidente y marca residuos entre
        sus causas. Si había un contenedor a menos de 50 m, la próxima ruta que se genere lo
        incluye aunque no esté crítico.
      </Notice>

      {error && (
        <Notice type="error" title={`[${error.code}]`}>
          {generalMessage(error) ?? error.message}
        </Notice>
      )}

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
