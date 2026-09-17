import { useCallback, useEffect, useState } from 'react';
import Table from '../components/ui/Table.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Notice from '../components/ui/Notice.jsx';
import DriverFormModal from '../components/drivers/DriverFormModal.jsx';
import DeleteDriverModal from '../components/drivers/DeleteDriverModal.jsx';
import IssueCredentialModal from '../components/drivers/IssueCredentialModal.jsx';
import {
  fetchDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
  reactivateDriver,
} from '../api/waste.js';
import { generalMessage } from '../domain/errors.js';

/**
 * CU-09 · Choferes.
 *
 * Los choferes son entidad de este modulo (ADR-009). La pantalla existe por dos
 * cosas, y ninguna es el ABM en si:
 *
 *  1. Que la asignacion de rutas tenga a quien ofrecer: `choferId` es el uuid
 *     de uno de estos, y el <select> se llena con los activos.
 *  2. Emitir la credencial con la que el chofer entra a /chofer. No hay login,
 *     y sin esta pantalla la unica forma de emitirla era Swagger.
 *
 * La columna que importa es "Acceso". Un chofer sin `usuarioSub` puede recibir
 * una ruta y no verla nunca, sin ningun error en ningun lado: es la trampa que
 * quedo despues de ADR-009, y esta es la unica pantalla donde se ve de un
 * vistazo quien la tiene. El `usuarioSub` en si no se muestra: es un
 * identificador opaco y aleatorio que no le dice nada a nadie.
 */
export default function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [reactivating, setReactivating] = useState(null);

  const load = useCallback(() => {
    // Los dados de baja se piden a proposito y solo desde aca: el default del
    // endpoint son los activos, que es lo que necesita el selector de rutas.
    fetchDrivers(showInactive ? { incluirInactivos: true } : {})
      .then((list) => {
        setDrivers(list);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const closeDialog = () => setDialog(null);
  const afterSave = (message) => {
    closeDialog();
    setSuccess(message);
    load();
  };

  /**
   * Reactivar no pregunta nada: es la accion que DESHACE, y ponerle un modal de
   * confirmacion al arrepentimiento es al reves de lo que hace falta. Como la
   * baja no toca el `usuarioSub`, el chofer vuelve con la credencial que tenia,
   * y por eso el mensaje distingue entre el que tiene acceso y el que no lo
   * tuvo nunca: en el segundo caso todavia falta emitirle una.
   */
  const reactivate = async (driver) => {
    setReactivating(driver.id);
    setError(null);
    try {
      const back = await reactivateDriver(driver.id);
      setSuccess(
        back.usuarioSub
          ? `${back.nombre} vuelve a estar activo, con la credencial que ya tenía.`
          : `${back.nombre} vuelve a estar activo. Todavía no tiene acceso: emitile una credencial.`,
      );
      load();
    } catch (e) {
      setError(e);
    } finally {
      setReactivating(null);
    }
  };

  const columns = [
    { key: 'nombre', title: 'Nombre', render: (d) => <strong>{d.nombre}</strong> },
    { key: 'legajo', title: 'Legajo', render: (d) => <span className="mono">{d.legajo}</span> },
    {
      key: 'acceso',
      title: 'Acceso',
      render: (d) => {
        if (!d.activo) return <Chip variant="neutral">Dado de baja</Chip>;
        return d.usuarioSub ? (
          <Chip variant="success">Con acceso</Chip>
        ) : (
          <Chip variant="warning" title="Se le pueden asignar rutas, pero no las ve hasta que le emitas una credencial">
            Sin acceso
          </Chip>
        );
      },
    },
    {
      key: 'acciones',
      title: '',
      // Un dado de baja tiene una sola accion: volver. Editarlo o emitirle una
      // credencial no se ofrece porque el backend responde 409 CHOFER_INACTIVO,
      // y reactivar es justamente el paso previo a las dos cosas.
      render: (d) =>
        d.activo ? (
          <div className="actions-cell">
            <Button variant="secondary" size="sm" onClick={() => setDialog({ type: 'credential', driver: d })}>
              Emitir credencial
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog({ type: 'edit', driver: d })}>
              Editar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog({ type: 'delete', driver: d })}>
              Dar de baja
            </Button>
          </div>
        ) : (
          <div className="actions-cell">
            <Button
              variant="secondary"
              size="sm"
              disabled={reactivating === d.id}
              onClick={() => reactivate(d)}
            >
              {reactivating === d.id ? 'Reactivando…' : 'Reactivar'}
            </Button>
          </div>
        ),
    },
  ];

  const active = drivers.filter((d) => d.activo);
  const withAccess = active.filter((d) => d.usuarioSub).length;

  return (
    <div className="screen">
      <Notice type="info" title="Para qué sirve">
        Son los choferes que aparecen al asignar una ruta (CU-09). Cada uno entra a su pantalla con
        una credencial que se emite acá: no hay login. Hoy {withAccess} de {active.length} activos
        tienen acceso.
      </Notice>

      <div className="filter-bar">
        <label className="filter-check">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar dados de baja
        </label>
        <div className="filter-bar-right">
          <Button onClick={() => setDialog({ type: 'create' })}>+ Nuevo chofer</Button>
        </div>
      </div>

      {error && <Notice type="error" title={`[${error.code}]`}>{generalMessage(error) ?? error.message}</Notice>}
      {success && <Notice type="success">{success}</Notice>}

      <Table
        columns={columns}
        rows={drivers}
        loading={loading}
        rowKey={(d) => d.id}
        emptyText="Todavía no hay choferes. Sin choferes no se puede asignar ninguna ruta."
      />

      {dialog?.type === 'create' && (
        <DriverFormModal
          onClose={closeDialog}
          onSave={async (data) => {
            const created = await createDriver(data);
            afterSave(
              `${created.nombre} (${created.legajo}) dado de alta. Todavía no tiene acceso: ` +
                'emitile una credencial para que vea sus rutas.',
            );
          }}
        />
      )}

      {dialog?.type === 'edit' && (
        <DriverFormModal
          driver={dialog.driver}
          onClose={closeDialog}
          onSave={async (changes) => {
            await updateDriver(dialog.driver.id, changes);
            afterSave(`${changes.nombre} actualizado.`);
          }}
        />
      )}

      {dialog?.type === 'delete' && (
        <DeleteDriverModal
          driver={dialog.driver}
          onClose={closeDialog}
          onConfirm={async () => {
            await deleteDriver(dialog.driver.id);
            afterSave(
              `${dialog.driver.nombre} dado de baja. Ya no recibe rutas ni entra a su pantalla. ` +
                'Si fue un error, aparece en "Mostrar dados de baja" con el botón de reactivar.',
            );
          }}
        />
      )}

      {dialog?.type === 'credential' && (
        <IssueCredentialModal
          driver={dialog.driver}
          onClose={closeDialog}
          onDone={() => {
            // El listado se recarga porque emitir rota el `usuarioSub`: el chip
            // de "Sin acceso" tiene que pasar a "Con acceso" sin refrescar.
            setSuccess(`Credencial emitida para ${dialog.driver.nombre}. La anterior, si tenía, ya no sirve.`);
            load();
          }}
        />
      )}
    </div>
  );
}
