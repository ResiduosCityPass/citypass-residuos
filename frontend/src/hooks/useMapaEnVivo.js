import { useCallback, useEffect, useRef, useState } from 'react';
import { obtenerContenedoresDelMapa, obtenerAlertas } from '../api/residuos.js';

/** No hay WebSocket (esta evaluado para Sprint 5). El mapa se refresca por polling. */
export const INTERVALO_POLLING_MS = 30_000;

/**
 * Mantiene el mapa vivo: cada `intervaloMs` vuelve a pedir los contenedores y
 * las alertas de incendio abiertas.
 *
 * Las dos llamadas van juntas porque `GET /mapa/contenedores` no informa nada de
 * alertas, y un contenedor puede estar VERDE con un incendio abierto (el incendio
 * se evalua contra la temperatura, no contra el llenado). Sin este cruce, ese caso
 * —que es justo el que no se puede pasar por alto— no se ve en el mapa.
 */
export function useMapaEnVivo(filtros = {}, intervaloMs = INTERVALO_POLLING_MS) {
  const [contenedores, setContenedores] = useState([]);
  const [incendiosPorContenedor, setIncendios] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [actualizadoEn, setActualizadoEn] = useState(null);

  const vivo = useRef(true);
  const { zonaId, tipoResiduo, estado } = filtros;

  const refrescar = useCallback(async () => {
    try {
      const [delMapa, alertasIncendio] = await Promise.all([
        obtenerContenedoresDelMapa({ zonaId, tipoResiduo, estado }),
        obtenerAlertas({ tipo: 'INCENDIO', estado: 'ABIERTA' }),
      ]);
      if (!vivo.current) return;

      setContenedores(delMapa);
      setIncendios(Object.fromEntries(alertasIncendio.map((a) => [a.contenedorId, a])));
      setActualizadoEn(new Date());
      setError(null);
    } catch (e) {
      if (vivo.current) setError(e);
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, [zonaId, tipoResiduo, estado]);

  useEffect(() => {
    vivo.current = true;
    // La primera pasada va sin esperar los 30 s; el polling es la sincronizacion con el backend.
    // oxlint-disable-next-line react/set-state-in-effect
    refrescar();
    const id = setInterval(refrescar, intervaloMs);
    return () => {
      vivo.current = false;
      clearInterval(id);
    };
  }, [refrescar, intervaloMs]);

  return { contenedores, incendiosPorContenedor, cargando, error, actualizadoEn, refrescar };
}
