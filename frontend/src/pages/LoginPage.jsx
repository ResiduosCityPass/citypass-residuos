import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { federatedEnabled, login } from '../auth/session.js';
import Button from '../components/ui/Button.jsx';
import Field from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import './LoginPage.css';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
      setPassword('');
      const target = location.state?.returnTo;
      navigate(typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login') ? target : '/mapa', { replace: true });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <main className="login-screen">
    <section className="panel-card login-card">
      <p className="muted">CityPass+ · Gestión de Residuos</p>
      <h1>Iniciar sesión</h1>
      <p>Ingresá con tu cuenta de CityPass para operar el servicio de recolección.</p>
      {!federatedEnabled() ? <Notice type="info">El login federado todavía no está habilitado en este entorno. <Link to="/mapa">Ir al módulo</Link></Notice> : <form onSubmit={submit}>
        {error && <Notice type="error">{error}</Notice>}
        <Field label="Usuario" htmlFor="login-user" required><input id="login-user" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={busy} /></Field>
        <Field label="Contraseña" htmlFor="login-password" required><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} /></Field>
        <Button type="submit" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</Button>
      </form>}
      <Link to="/cerca">Consultar contenedores cercanos</Link>
      <Link to="/chofer">Acceso para choferes</Link>
    </section>
  </main>;
}
