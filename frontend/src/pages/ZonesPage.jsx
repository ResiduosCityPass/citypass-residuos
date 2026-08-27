import { useCallback, useEffect, useMemo, useState } from 'react';
import Table from '../components/ui/Table.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Notice from '../components/ui/Notice.jsx';
import ZoneFormModal from '../components/zones/ZoneFormModal.jsx';
import DeleteZoneModal from '../components/zones/DeleteZoneModal.jsx';
import {
  fetchZones,
  fetchContainers,
  createZone,
  updateZone,
  setZoneBlocked,
  deleteZone,
} from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';

/**
 * CU-02 · Zonas y umbrales.
 *
 * La zona no es un poligono dibujado sobre el mapa: es una entidad con nombre y
 * dos umbrales (ADR-004 recorto el poligono a proposito). Toda la regla de
 * negocio que consume CU-05 vive en esos dos numeros, y esta es la pantalla que
 * los controla. Cambiar un umbral aca cambia cuando se pone rojo medio barrio.
 */
export default function ZonesPage() {
  const [zones, setZones] = useState([]);
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [dialog, setDialog] = useState(null);

  // Cuantos contenedores cuelgan de cada zona. Sirve para dos cosas: dar
  // contexto al umbral (un cambio en Centro afecta a seis contenedores) y
  // adelantar que el borrado va a fallar antes de intentarlo.
  const containersPerZone = useMemo(() => {
    const count = {};
    for (const c of containers) count[c.zonaId] = (count[c.zonaId] ?? 0) + 1;
    return count;
  }, [containers]);

  // `loading` arranca en true y solo se apaga: no se vuelve a prender en cada
  // recarga. Un esqueleto parpadeando sobre una tabla que ya tiene datos se lee
  // como un error, y despues de guardar algo la tabla ya esta en pantalla.
  const load = useCallback(() => {
    Promise.all([fetchZones(), fetchContainers()])
      .then(([itsZones, itsContainers]) => {
        setZones(itsZones);
        setContainers(itsContainers);
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

  const toggleBlocked = async (zone) => {
    setError(null);
    try {
      await setZoneBlocked(zone.id, !zone.bloqueada);
      setSuccess(
        zone.bloqueada
          ? `La zona ${zone.nombre} vuelve a entrar en el ruteo.`
          : `La zona ${zone.nombre} queda excluida del ruteo.`,
      );
      load();
    } catch (e) {
      setError(e);
    }
  };

  const columns = [
    { key: 'nombre', title: 'Zona', render: (z) => <strong>{z.nombre}</strong> },
    {
      key: 'umbral',
      title: 'Umbral de llenado',
      render: (z) => <span className="mono">{z.umbralCriticoPct}%</span>,
    },
    {
      key: 'temperatura',
      title: 'Umbral de temperatura',
      render: (z) => <span className="mono">{z.umbralTemperaturaC} °C</span>,
    },
    {
      key: 'contenedores',
      title: 'Contenedores',
      render: (z) => containersPerZone[z.id] ?? 0,
    },
    {
      key: 'bloqueo',
      title: 'Ruteo',
      render: (z) =>
        z.bloqueada
          ? <Chip variant="warning">Bloqueada</Chip>
          : <Chip variant="success">Activa</Chip>,
    },
    {
      key: 'acciones',
      title: '',
      render: (z) => (
        <div className="actions-cell">
          <Button variant="secondary" size="sm" onClick={() => setDialog({ type: 'edit', zone: z })}>
            Editar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toggleBlocked(z)}>
            {z.bloqueada ? 'Desbloquear' : 'Bloquear'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={(containersPerZone[z.id] ?? 0) > 0}
            disabledReason={`Tiene ${containersPerZone[z.id]} contenedores asignados. Reasignalos o dalos de baja primero.`}
            onClick={() => setDialog({ type: 'delete', zone: z })}
          >
            Borrar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="screen">
      <Notice type="info" title="Qué define una zona">
        El umbral de llenado decide a partir de qué porcentaje un contenedor pasa a CRÍTICO. El de
        temperatura dispara las alertas de incendio, sin importar cuán lleno esté. Una zona
        bloqueada queda excluida del ruteo.
      </Notice>

      <div className="filter-bar">
        <div className="filter-bar-right">
          <Button onClick={() => setDialog({ type: 'create' })}>+ Nueva zona</Button>
        </div>
      </div>

      {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}
      {success && <Notice type="success">{success}</Notice>}

      <Table
        columns={columns}
        rows={zones}
        loading={loading}
        rowKey={(z) => z.id}
        emptyText="Todavía no hay zonas. Creá una antes de dar de alta contenedores."
      />

      {dialog?.type === 'create' && (
        <ZoneFormModal
          onClose={closeDialog}
          onSave={async (data) => {
            const created = await createZone(data);
            afterSave(`Zona ${created.nombre} creada con umbral ${created.umbralCriticoPct}%.`);
          }}
        />
      )}

      {dialog?.type === 'edit' && (
        <ZoneFormModal
          zone={dialog.zone}
          onClose={closeDialog}
          onSave={async (changes) => {
            await updateZone(dialog.zone.id, changes);
            afterSave(`Zona ${changes.nombre} actualizada.`);
          }}
        />
      )}

      {dialog?.type === 'delete' && (
        <DeleteZoneModal
          zone={dialog.zone}
          onClose={closeDialog}
          onConfirm={async () => {
            await deleteZone(dialog.zone.id);
            afterSave(`Zona ${dialog.zone.nombre} borrada.`);
          }}
        />
      )}
    </div>
  );
}
