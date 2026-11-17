import { useEffect, useState } from 'react';
import { fetchNeighborhoods } from '../api/waste.js';

/** Un fallo del catálogo no debe impedir revisar una alerta o editar umbrales. */
export function useNeighborhoods() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => fetchNeighborhoods()).then((items) => {
      if (!Array.isArray(items)) throw new Error('Catálogo inválido');
      if (active) { setCatalog(items); setError(false); }
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return { catalog, error, loading, retry: () => { setLoading(true); setAttempt((value) => value + 1); } };
}
