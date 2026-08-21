import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMapContainers, fetchAlerts } from '../api/waste.js';

/** No hay WebSocket (esta evaluado para Sprint 5). El mapa se refresca por polling. */
export const POLLING_INTERVAL_MS = 30_000;

/**
 * Mantiene el mapa vivo: cada `intervalMs` vuelve a pedir los contenedores y
 * las alertas de incendio abiertas.
 *
 * Las dos llamadas van juntas porque `GET /mapa/contenedores` no informa nada de
 * alertas, y un contenedor puede estar VERDE con un incendio abierto (el incendio
 * se evalua contra la temperatura, no contra el llenado). Sin este cruce, ese caso
 * —que es justo el que no se puede pasar por alto— no se ve en el mapa.
 */
export function useLiveMap(filters = {}, intervalMs = POLLING_INTERVAL_MS) {
  const [containers, setContainers] = useState([]);
  const [firesByContainer, setFires] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const alive = useRef(true);
  const { zonaId, tipoResiduo, estado } = filters;

  const refresh = useCallback(async () => {
    try {
      const [fromMap, fireAlerts] = await Promise.all([
        fetchMapContainers({ zonaId, tipoResiduo, estado }),
        fetchAlerts({ tipo: 'INCENDIO', estado: 'ABIERTA' }),
      ]);
      if (!alive.current) return;

      setContainers(fromMap);
      setFires(Object.fromEntries(fireAlerts.map((a) => [a.contenedorId, a])));
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [zonaId, tipoResiduo, estado]);

  useEffect(() => {
    alive.current = true;
    // La primera pasada va sin esperar los 30 s; el polling es la sincronizacion con el backend.
    // oxlint-disable-next-line react/set-state-in-effect
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return { containers, firesByContainer, loading, error, updatedAt, refresh };
}
