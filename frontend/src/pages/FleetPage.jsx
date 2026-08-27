import { useCallback, useEffect, useState } from 'react';
import Table from '../components/ui/Table.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Notice from '../components/ui/Notice.jsx';
import TruckFormModal from '../components/fleet/TruckFormModal.jsx';
import { fetchTrucks, createTruck, updateTruck } from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';
import { TRUCK_STATE_LABEL, TRUCK_STATE_CHIP, WASTE_TYPE_LABEL } from '../domain/states.js';

/**
 * CU-03 · Flota.
 *
 * Un ABM chico, y a proposito: el caso de uso solo aporta valor junto con CU-08.
 * Lo que se controla aca es cuantos camiones hay, de que tipo de residuo, con
 * cuanta capacidad y cuales estan disponibles para recibir una ruta.
 *
 * **No hay borrado.** El contrato expone POST, GET y PATCH y nada mas: un camion
 * dado de baja seguiria colgando de las rutas historicas que ejecuto. Se lo
 * saca de circulacion poniendolo en MANTENIMIENTO.
 */
export default function FleetPage() {
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    fetchTrucks()
      .then((list) => {
        setTrucks(list);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeDialog = () => setDialog(null);
  const afterSave = (message) => {
    closeDialog();
    setSuccess(message);
    load();
  };

  const columns = [
    { key: 'patente', title: 'Patente', render: (t) => <strong className="mono">{t.patente}</strong> },
    {
      key: 'capacidad',
      title: 'Capacidad',
      render: (t) => <span className="mono">{t.capacidadLitros.toLocaleString('es-AR')} L</span>,
    },
    {
      key: 'residuo',
      title: 'Residuo habilitado',
      render: (t) => WASTE_TYPE_LABEL[t.tipoResiduoHabilitado],
    },
    {
      key: 'estado',
      title: 'Estado',
      render: (t) => <Chip variant={TRUCK_STATE_CHIP[t.estado]}>{TRUCK_STATE_LABEL[t.estado]}</Chip>,
    },
    {
      key: 'acciones',
      title: '',
      render: (t) => (
        <div className="actions-cell">
          <Button variant="secondary" size="sm" onClick={() => setDialog({ type: 'edit', truck: t })}>
            Editar
          </Button>
        </div>
      ),
    },
  ];

  const available = trucks.filter((t) => t.estado === 'DISPONIBLE').length;

  return (
    <div className="screen">
      <Notice type="info" title="Para qué sirve la flota">
        Cada camión declara qué tipo de residuo puede levantar y cuánto entra. Al generar una ruta
        (CU-08), la heurística solo considera camiones <strong>disponibles</strong> y contenedores
        del tipo que ese camión tiene habilitado. Hoy hay {available} de {trucks.length} disponibles.
      </Notice>

      <div className="filter-bar">
        <div className="filter-bar-right">
          <Button onClick={() => setDialog({ type: 'create' })}>+ Nuevo camion</Button>
        </div>
      </div>

      {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}
      {success && <Notice type="success">{success}</Notice>}

      <Table
        columns={columns}
        rows={trucks}
        loading={loading}
        rowKey={(t) => t.id}
        emptyText="Todavía no hay camiones. Sin flota no se pueden generar rutas."
      />

      {dialog?.type === 'create' && (
        <TruckFormModal
          onClose={closeDialog}
          onSave={async (data) => {
            const created = await createTruck(data);
            afterSave(`Camion ${created.patente} agregado a la flota.`);
          }}
        />
      )}

      {dialog?.type === 'edit' && (
        <TruckFormModal
          truck={dialog.truck}
          onClose={closeDialog}
          onSave={async (changes) => {
            await updateTruck(dialog.truck.id, changes);
            afterSave(`Camion ${dialog.truck.patente} actualizado.`);
          }}
        />
      )}
    </div>
  );
}
