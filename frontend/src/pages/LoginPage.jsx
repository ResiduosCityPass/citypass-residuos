import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { federatedEnabled, login } from '../auth/session.js';
import Button from '../components/ui/Button.jsx';
import Field from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import { Icons } from '../components/shell/Icons.jsx';
import './LoginPage.css';

function CityIllustration() {
  return <svg className="login-city" viewBox="0 0 400 240" fill="none" aria-hidden="true">
    <g className="login-city-blocks" strokeWidth="1">
      <rect x="22" y="30" width="72" height="44" rx="8" />
      <rect x="118" y="14" width="72" height="60" rx="8" />
      <rect x="214" y="30" width="60" height="44" rx="8" />
      <rect x="298" y="14" width="80" height="60" rx="8" />
      <rect x="22" y="98" width="120" height="50" rx="8" />
      <rect x="166" y="98" width="60" height="50" rx="8" />
      <rect x="250" y="98" width="128" height="50" rx="8" />
      <rect x="22" y="172" width="72" height="54" rx="8" />
      <rect x="118" y="172" width="156" height="54" rx="8" />
      <rect x="298" y="172" width="80" height="54" rx="8" />
    </g>
    <path className="login-city-road" d="M0 86h400M0 160h400M106 0v240M238 0v240M286 0v240" strokeWidth="1" strokeDasharray="3 7" />
    <path className="login-city-route" d="M58 52h36a12 12 0 0 1 12 12v84a12 12 0 0 0 12 12h156a12 12 0 0 0 12-12v-13a12 12 0 0 1 12-12h39" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <g className="login-city-stop"><circle cx="58" cy="52" r="13" /><circle cx="58" cy="52" r="4" /></g>
    <g className="login-city-stop"><circle cx="174" cy="160" r="13" /><circle cx="174" cy="160" r="4" /></g>
    <g className="login-city-destination" transform="translate(311 92)">
      <rect width="52" height="62" rx="14" />
      <path d="M16 23h20m-15 0v-5h10v5m-12 0 1.5 22h11L33 23m-9 6v10m5-10v10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
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
    <div className="login-layout">
      <aside className="login-intro" aria-label="CityPass+ · Gestión de Residuos">
        <div className="login-brand">
          <img src="/citypass-logo.png" alt="" width="46" height="64" />
          <div><span className="login-wordmark">CityPass<strong>+</strong></span><span className="login-brand-caption">Una ciudad, todos sus servicios.</span></div>
        </div>
        <div className="login-intro-content">
          <span className="login-module"><Icons.waste /> Gestión de Residuos</span>
          <h2>Una ciudad más limpia, mejor conectada.</h2>
          <p>Coordiná la recolección, atendé alertas y acompañá la recuperación del servicio.</p>
        </div>
        <div className="login-city-wrap"><CityIllustration /></div>
        <p className="login-intro-footer"><span aria-hidden="true" /> Gestión de Residuos Inteligente</p>
      </aside>
      <section className="login-card" aria-labelledby="login-title">
        <header className="login-heading">
          <span className="login-eyebrow">Panel de gestión</span>
          <h1 id="login-title">Iniciar sesión</h1>
          <p>Ingresá con tu cuenta de CityPass+ para gestionar el servicio de recolección.</p>
        </header>
        {!federatedEnabled() ? <Notice type="info">El login federado todavía no está habilitado en este entorno. <Link to="/mapa">Ir al módulo</Link></Notice> : <form className="login-form" onSubmit={submit} aria-busy={busy}>
          {error && <Notice type="error">{error}</Notice>}
          <Field label="Usuario" htmlFor="login-user" required>
            <div className="login-input-wrap"><Icons.profile /><input id="login-user" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Tu usuario de CityPass+" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={busy} /></div>
          </Field>
          <Field label="Contraseña" htmlFor="login-password" required>
            <div className="login-input-wrap login-password-wrap">
              <Icons.lock />
              <input id="login-password" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" placeholder="Ingresá tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
              <button className="login-password-toggle" type="button" aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-controls="login-password" disabled={busy} onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? 'Ocultar' : 'Mostrar'}</button>
            </div>
          </Field>
          <Button type="submit" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}<span aria-hidden="true">→</span></Button>
          <p className="login-help">Si necesitás acceso, contactá al administrador de tu módulo.</p>
        </form>}
        <nav className="login-other-access" aria-label="Otros accesos">
          <p>También podés acceder a</p>
          <Link to="/cerca"><span className="login-access-icon"><Icons.map /></span><span><strong>Consultar contenedores cercanos</strong><small>Encontrá dónde depositar tus residuos.</small></span><span className="login-access-arrow" aria-hidden="true">↗</span></Link>
          <Link to="/chofer"><span className="login-access-icon"><Icons.fleet /></span><span><strong>Acceso para choferes</strong><small>Consultá tu ruta y registrá los vaciados.</small></span><span className="login-access-arrow" aria-hidden="true">↗</span></Link>
        </nav>
      </section>
    </div>
  </main>;
}
