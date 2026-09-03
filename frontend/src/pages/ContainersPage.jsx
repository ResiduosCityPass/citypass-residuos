import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Table from '../components/ui/Table.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Notice from '../components/ui/Notice.jsx';
import FillBar from '../components/ui/FillBar.jsx';
import ContainerFormModal from '../components/containers/ContainerFormModal.jsx';
import DeleteContainerModal from '../components/containers/DeleteContainerModal.jsx';
import LinkSensorModal from '../components/containers/LinkSensorModal.jsx';
import {
  fetchContainers,
  fetchZones,
  createContainer,
  updateContainer,
  deleteContainer,
} from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';
import {
  COLOR_BY_STATE,
  STATE_LABEL,
  WASTE_TYPE_LABEL,
  colorForState,
  timeAgo,
  neverReported,
} from '../domain/states.js';

/**
 * CU-01 · Contenedores.
 *
 * El caso de uso se llama "registrar contenedor y sensor", pero lo que hace
 * falta es el ABM completo: listar, dar de alta, editar, dar de baja y vincular
 * el sensor. Cada una es una vista distinta y todas cuelgan de esta tabla.
 */
export default function ContainersPage() {
  const [containers, setContainers] = useState([]);
  const [zones, setZones] = useState([]);
  const [filters, setFilters] = useState({ zonaId: '', tipoResiduo: '', estado: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Una sola variable para los cuatro modales: nunca hay dos abiertos a la vez,
  // y con un booleano por modal terminan abiertos dos al mismo tiempo.
  const [dialog, setDialog] = useState(null); // { type, container }

  const zoneById = useMemo(
    () => Object.fromEntries(zones.map((z) => [z.id, z])),
    [zones],
  );

  // `loading` arranca en true y solo se apaga: no se vuelve a prender en cada
  // recarga. Un esqueleto parpadeando sobre una tabla que ya tiene datos se lee
  // como un error, y despues de guardar algo la tabla ya esta en pantalla.
  const load = useCallback(() => {
    Promise.all([fetchContainers(filters), fetchZones()])
      .then(([list, itsZones]) => {
        setContainers(list);
        setZones(itsZones);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const closeDialog = () => setDialog(null);

  const afterSave = (message) => {
    closeDialog();
    setSuccess(message);
    load();
  };

  const changeFilter = (field) => (e) =>
    setFilters((previous) => ({ ...previous, [field]: e.target.value }));

  const columns = [
    {
      key: 'codigo',
      title: 'Codigo',
      render: (c) => <Link to={`/contenedores/${c.id}`} className="mono code-link">{c.codigo}</Link>,
    },
    {
      key: 'zona',
      title: 'Zona',
      render: (c) => (
        <>
          {zoneById[c.zonaId]?.nombre ?? '—'}
          {zoneById[c.zonaId]?.bloqueada && <Chip variant="warning">bloqueada</Chip>}
        </>
      ),
    },
    { key: 'tipo', title: 'Residuo', render: (c) => WASTE_TYPE_LABEL[c.tipoResiduo] },
    {
      key: 'llenado',
      title: 'Llenado',
      width: 190,
      render: (c) => (
        <div className="fill-cell">
          <FillBar
            levelPct={c.nivelLlenadoPct}
            thresholdPct={zoneById[c.zonaId]?.umbralCriticoPct}
            state={c.estado}
            compact
          />
          <span className="mono">{c.nivelLlenadoPct}%</span>
        </div>
      ),
    },
    {
      key: 'estado',
      title: 'Estado',
      render: (c) => <Chip color={colorForState(c.estado)}>{STATE_LABEL[c.estado]}</Chip>,
    },
    {
      key: 'lectura',
      title: 'Ultima lectura',
      // Un contenedor que nunca reporto no es uno vacio: es uno que no reporta,
      // y su verde al 0% miente. Se distingue aca en vez de dejarlo pasar.
      render: (c) =>
        neverReported(c)
          ? <span className="muted">nunca reportó</span>
          : <span className="muted">{timeAgo(c.ultimaLecturaEn)}</span>,
    },
    {
      key: 'acciones',
      title: '',
      render: (c) => (
        <div className="actions-cell">
          <Button variant="secondary" size="sm"
                  onClick={() => setDialog({ type: 'edit', container: c })}>
            Editar
          </Button>
          <Button variant="secondary" size="sm"
                  onClick={() => setDialog({ type: 'sensor', container: c })}>
            Sensor
          </Button>
          <Button variant="danger" size="sm"
                  onClick={() => setDialog({ type: 'delete', container: c })}>
            Baja
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="screen">
      <div className="filter-bar">
        <select value={filters.zonaId} onChange={changeFilter('zonaId')} aria-label="Filtrar por zona">
          <option value="">Todas las zonas</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
        </select>

        <select value={filters.tipoResiduo} onChange={changeFilter('tipoResiduo')} aria-label="Filtrar por tipo de residuo">
          <option value="">Todo tipo de residuo</option>
          {Object.entries(WASTE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <select value={filters.estado} onChange={changeFilter('estado')} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          {Object.keys(COLOR_BY_STATE).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
        </select>

        <div className="filter-bar-right">
          <Button onClick={() => setDialog({ type: 'create' })} disabled={zones.length === 0}
                  disabledReason="Creá una zona antes: todo contenedor pertenece a una">
            + Nuevo contenedor
          </Button>
        </div>
      </div>

      {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}
      {success && <Notice type="success">{success}</Notice>}

      <Table
        columns={columns}
        rows={containers}
        loading={loading}
        rowKey={(c) => c.id}
        emptyText="No hay contenedores para estos filtros."
      />

      {dialog?.type === 'create' && (
        <ContainerFormModal
          zones={zones}
          onClose={closeDialog}
          onSave={async (data) => {
            const created = await createContainer(data);
            afterSave(`Contenedor ${created.codigo} creado. Vinculale un sensor para que empiece a reportar.`);
          }}
        />
      )}

      {dialog?.type === 'edit' && (
        <ContainerFormModal
          container={dialog.container}
          zones={zones}
          onClose={closeDialog}
          onSave={async (changes) => {
            await updateContainer(dialog.container.id, changes);
            afterSave(`Contenedor ${dialog.container.codigo} actualizado.`);
          }}
        />
      )}

      {dialog?.type === 'delete' && (
        <DeleteContainerModal
          container={dialog.container}
          onClose={closeDialog}
          onConfirm={async () => {
            await deleteContainer(dialog.container.id);
            afterSave(`Contenedor ${dialog.container.codigo} dado de baja.`);
          }}
        />
      )}

      {/* El listado no informa si el contenedor ya tiene sensor: GET /contenedores
          no devuelve `sensor` ni un `tieneSensor`. Se deja intentar y, si ya lo
          tiene, el backend responde 409 CONTENEDOR_YA_TIENE_SENSOR y el modal lo
          muestra. Es un pedido de contrato pendiente con Francisco. */}
      {dialog?.type === 'sensor' && (
        <LinkSensorModal
          container={dialog.container}
          onClose={closeDialog}
          onDone={() => afterSave(`Sensor vinculado a ${dialog.container.codigo}.`)}
        />
      )}
    </div>
  );
}
