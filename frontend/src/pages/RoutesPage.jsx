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
      render: (r) =>
        r.chofer
          ? r.chofer.nombre
          : <span className="muted">sin asignar</span>,
    },
    {
      key: 'paradas',
      title: 'Paradas',
      render: (r) => {
        const done = r.paradas.filter((p) => p.estado === 'CONFIRMADA').length;
        return <span className="mono">{done}/{r.paradas.length}</span>;
      },
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
