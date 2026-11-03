import { useEffect, useState, useSyncExternalStore } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { accessToken, federatedEnabled, logout, subscribeSession } from './session.js';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import { SessionContext } from './SessionContext.js';

function FederatedSession({ children }) {
  const token = useSyncExternalStore(subscribeSession, accessToken);
  const location = useLocation();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    api.get('/auth/sesion').then(
      (user) => { if (active) setResult({ token, user }); },
      (error) => { if (active) setResult({ token, error }); },
    );
    return () => { active = false; };
  }, [token, attempt]);
  if (!token) return <Navigate to="/login" state={{ returnTo: location.pathname + location.search }} replace />;
  if (result?.token !== token) return <p role="status">Verificando sesión…</p>;
  if (result.error) return <main className="screen">
    <Notice type="error" title="No se pudo verificar la sesión">{result.error.message}</Notice>
    <Button onClick={() => setAttempt((v) => v + 1)}>Reintentar</Button>
    <Button variant="secondary" onClick={logout}>Volver a iniciar sesión</Button>
  </main>;
  if (!['ADMINISTRADOR', 'OPERADOR'].includes(result.user.rol)) return <main className="screen">
    <Notice type="warning" title="Sin permisos de operación">
      Tu cuenta está autenticada. Falta que el administrador de Login asigne un grupo autorizado para operar Residuos.
    </Notice>
    <Button onClick={logout}>Cerrar sesión</Button>
  </main>;
  return <SessionContext.Provider value={result.user}>{children}</SessionContext.Provider>;
}

export default function OperatorSession({ children }) {
  return federatedEnabled() ? <FederatedSession>{children}</FederatedSession> : children;
}
