import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMapContainers } from '../api/waste.js';

/** No hay WebSocket (esta evaluado para Sprint 5). El mapa se refresca por polling. */
export const POLLING_INTERVAL_MS = 30_000;

/**
 * Mantiene el mapa vivo: cada `intervalMs` vuelve a pedir los contenedores.
 *
 * Es UNA sola llamada. Antes eran dos: habia que cruzar el mapa contra
 * `/alertas?tipo=INCENDIO&estado=ABIERTA` porque el payload del mapa no decia
 * nada de incendios, y un contenedor puede estar VERDE y estar prendido fuego
 * al mismo tiempo (el incendio se evalua contra la temperatura, no contra el
 * llenado). Ahora `GET /mapa/contenedores` trae `incendioActivo` por
 * contenedor y el cruce desaparecio: la mitad de las llamadas del polling.
 */
export function useLiveMap(filters = {}, intervalMs = POLLING_INTERVAL_MS) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const alive = useRef(true);
  const { zonaId, tipoResiduo, estado } = filters;

  const refresh = useCallback(async () => {
    try {
      const fromMap = await fetchMapContainers({ zonaId, tipoResiduo, estado });
      if (!alive.current) return;

      setContainers(fromMap);
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

  return { containers, loading, error, updatedAt, refresh };
}
