import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Shell from './components/shell/Shell.jsx';
import MapPage from './pages/MapPage.jsx';
import ContainersPage from './pages/ContainersPage.jsx';
import ContainerDetailPage from './pages/ContainerDetailPage.jsx';
import ZonesPage from './pages/ZonesPage.jsx';
import AlertsPage from './pages/AlertsPage.jsx';
import FleetPage from './pages/FleetPage.jsx';
import RoutesPage from './pages/RoutesPage.jsx';
import RouteDetailPage from './pages/RouteDetailPage.jsx';
import NearbyContainersPage from './pages/NearbyContainersPage.jsx';
import DriverStopsPage from './pages/DriverStopsPage.jsx';
import { fetchAlerts } from './api/waste.js';
import './App.css';

/**
 * Titulo de la barra superior segun la ruta. Vive en un solo lugar para que la
 * pantalla no pueda decir una cosa y el sidebar marcar otra.
 *
 * Las rutas quedan en castellano: espejan las del backend y las ve el usuario
 * en la barra de direcciones.
 */
const TITLES = {
  '/mapa': ['Mapa en tiempo real', 'CU-07 · estado de los contenedores, minuto a minuto'],
  '/contenedores': ['Contenedores', 'CU-01 · alta, edicion, baja y vinculacion de sensores'],
  '/zonas': ['Zonas y umbrales', 'CU-02 · a partir de que nivel un contenedor es critico'],
  '/alertas': ['Alertas', 'CU-05 / CU-06 · saturacion e incendio'],
  '/flota': ['Flota', 'CU-03 · camiones, capacidad y disponibilidad'],
  '/rutas': ['Rutas', 'CU-08 / CU-09 · generacion y asignacion'],
};

function titleFor(pathname) {
  if (pathname.startsWith('/contenedores/')) return ['Detalle del contenedor', 'CU-01'];
  if (pathname.startsWith('/rutas/')) return ['Detalle de la ruta', 'CU-08 / CU-09'];
  return TITLES[pathname] ?? ['Residuos', ''];
}

/**
 * Las dos pantallas que NO son del operador: la consulta ciudadana (CU-11) y
 * la del chofer en la calle (CU-10). No tienen sidebar, no tienen barra
 * superior y —la ciudadana— no tiene token.
 *
 * Se enumeran las publicas en vez de derivarlas de las otras porque el
 * catch-all `*` tambien vive adentro del Shell: la polaridad correcta es
 * listar las excepciones.
 */
const PUBLIC_PATHS = ['/cerca', '/chofer'];
const isPublicPath = (pathname) => PUBLIC_PATHS.some((path) => pathname.startsWith(path));

/** Layout de las pantallas del operador. Solo monta en las rutas del Shell. */
function ShellLayout({ openAlerts, onTokenChange }) {
  const { pathname } = useLocation();
  const [title, subtitle] = titleFor(pathname);

  return (
    <Shell title={title} subtitle={subtitle} openAlerts={openAlerts} onTokenChange={onTokenChange}>
      <Outlet />
    </Shell>
  );
}

function Application() {
  const { pathname } = useLocation();
  const [tokenVersion, setTokenVersion] = useState(0);
  const [openAlerts, setOpenAlerts] = useState(0);

  // El globo del sidebar cuenta lo que alguien todavia tiene que atender:
  // ABIERTA y EN_ATENCION. Las resueltas ya no le piden nada a nadie.
  const countAlerts = useCallback(() => {
    fetchAlerts()
      .then((alerts) => setOpenAlerts(alerts.filter((a) => a.estado !== 'RESUELTA').length))
      .catch(() => setOpenAlerts(0));
  }, []);

  useEffect(() => {
    // La vista ciudadana no tiene token y la del chofer no tiene sidebar:
    // pedir /alertas ahi es un 401 garantizado para alimentar un globo que no
    // se ve.
    if (isPublicPath(pathname)) return;
    countAlerts();
  }, [countAlerts, tokenVersion, pathname]);

  const onTokenChange = () => setTokenVersion((v) => v + 1);

  // El estado vive aca arriba y no se baja por useOutletContext a proposito:
  // asi las paginas siguen recibiendo props explicitas y se pueden renderizar
  // sueltas en sus tests, sin un Outlet alrededor.
  return (
    <Routes>
      <Route element={<ShellLayout openAlerts={openAlerts} onTokenChange={onTokenChange} />}>
        <Route path="/" element={<Navigate to="/mapa" replace />} />
        <Route path="/mapa" element={<MapPage tokenVersion={tokenVersion} />} />
        <Route path="/contenedores" element={<ContainersPage />} />
        <Route path="/contenedores/:id" element={<ContainerDetailPage onAlertsChanged={countAlerts} />} />
        <Route path="/zonas" element={<ZonesPage />} />
        <Route path="/alertas" element={<AlertsPage onAlertsChanged={countAlerts} />} />
        <Route path="/flota" element={<FleetPage />} />
        <Route path="/rutas" element={<RoutesPage />} />
        <Route path="/rutas/:id" element={<RouteDetailPage />} />
        <Route path="*" element={<Navigate to="/mapa" replace />} />
      </Route>

      <Route path="/cerca" element={<NearbyContainersPage />} />
      <Route path="/chofer" element={<DriverStopsPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Application />
    </BrowserRouter>
  );
}
