import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Table from '../components/ui/Table.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Notice from '../components/ui/Notice.jsx';
import GenerateRouteModal from '../components/routes/GenerateRouteModal.jsx';
import { fetchRoutes, fetchTrucks, fetchZones, generateRoute } from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';
import { ROUTE_STATE_LABEL, ROUTE_STATE_CHIP, timeAgo } from '../domain/states.js';

/**
 * CU-08 · Rutas.
 *
 * El listado y el punto de entrada para generar una propuesta. Generar y
 * asignar estan separados a proposito (ver CU-09): la heuristica propone, una
 * persona confirma. Por eso al generar no se asigna nada, se navega a la
 * propuesta para que alguien la mire.
 */
export default function RoutesPage() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchRoutes(), fetchTrucks(), fetchZones()])
      .then(([itsRoutes, itsTrucks, itsZones]) => {
        setRoutes(itsRoutes);
        setTrucks(itsTrucks);
        setZones(itsZones);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      key: 'estado',
      title: 'Estado',
      render: (r) => <Chip variant={ROUTE_STATE_CHIP[r.estado]}>{ROUTE_STATE_LABEL[r.estado]}</Chip>,
    },
    {
      key: 'camion',
      title: 'Camion',
      render: (r) => <span className="mono">{r.camion?.patente ?? '—'}</span>,
    },
    {
      key: 'chofer',
      title: 'Chofer',
      // El listado trae el chofer expandido, asi que la fila dice un nombre y
      // no un uuid. Un chofer dado de baja sigue apareciendo en sus rutas
      // viejas: son el registro de quien ejecuto cada recoleccion.
      render: (r) =>
        r.chofer
          ? <span>{r.chofer.nombre} <span className="muted mono">{r.chofer.legajo}</span></span>
          : <span className="muted">sin asignar</span>,
    },
    {
      key: 'avance',
      title: 'Avance',
      // `avance` viene SIEMPRE, con los cuatro valores en 0 si la ruta no tiene
      // paradas, asi que se lee sin preguntar. Lo resuelve una sola consulta
      // agrupada del lado del backend: no es una llamada por fila, que era la
      // razon por la que esta columna no existia.
      render: (r) => {
        const { total = 0, confirmadas = 0, omitidas = 0 } = r.avance ?? {};
        if (total === 0) return <span className="muted">—</span>;
        return (
          <span>
            <span className="mono">{confirmadas} de {total}</span>
            {/* Las omitidas se cuentan aparte de las vaciadas a proposito: una
                parada omitida cierra y avanza la ruta, pero el contenedor sigue
                lleno. Sumarlas al "2 de 3" diria que se recolecto algo que
                nadie recolecto. */}
            {omitidas > 0 && (
              <span className="muted"> · {omitidas} {omitidas === 1 ? 'omitida' : 'omitidas'}</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'carga',
      title: 'Carga estimada',
      // Cuanto levanta el viaje. Es otra cosa que el avance: esto dice si la
      // heuristica aprovecho el camion, el avance dice cuanto se ejecuto.
      render: (r) => (
        <span className="mono">{(r.litrosEstimados ?? 0).toLocaleString('es-AR')} L</span>
      ),
    },
    {
      key: 'distancia',
      title: 'Distancia',
      render: (r) => <span className="mono">{r.distanciaEstimadaKm} km</span>,
    },
    { key: 'generada', title: 'Generada', render: (r) => <span className="muted">{timeAgo(r.generadaEn)}</span> },
    {
      key: 'acciones',
      title: '',
      render: (r) => (
        <div className="actions-cell">
          <Link to={`/rutas/${r.id}`} className="btn btn-secondary btn-sm">
            {r.estado === 'PROPUESTA' ? 'Revisar' : 'Ver'}
          </Link>
        </div>
      ),
    },
  ];

  const proposals = routes.filter((r) => r.estado === 'PROPUESTA').length;

  return (
    <div className="screen">
      {proposals > 0 && (
        <Notice type="warning" title={`Hay ${proposals} propuesta(s) sin confirmar`}>
          Una ruta propuesta no está asignada a nadie y no la ve ningún chofer. Revisala y
          confirmala, o descartala.
        </Notice>
      )}

      <div className="filter-bar">
        <div className="filter-bar-right">
          <Button onClick={() => setGenerating(true)} disabled={trucks.length === 0}
                  disabledReason="Cargá al menos un camión en la flota">
            + Generar ruta
          </Button>
        </div>
      </div>

      {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}

      <Table
        columns={columns}
        rows={routes}
        loading={loading}
        rowKey={(r) => r.id}
        emptyText="Todavía no se generó ninguna ruta."
      />

      {generating && (
        <GenerateRouteModal
          trucks={trucks}
          zones={zones}
          onClose={() => setGenerating(false)}
          onGenerate={async (data) => {
            const route = await generateRoute(data);
            setGenerating(false);
            // Se navega a la propuesta en vez de volver al listado: lo que sigue
            // es mirarla, no archivarla.
            navigate(`/rutas/${route.id}`);
          }}
        />
      )}
    </div>
  );
}
