import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Shell from './components/shell/Shell.jsx';
import MapPage from './pages/MapPage.jsx';
import ContainersPage from './pages/ContainersPage.jsx';
import ContainerDetailPage from './pages/ContainerDetailPage.jsx';
import ZonesPage from './pages/ZonesPage.jsx';
import AlertsPage from './pages/AlertsPage.jsx';
import FleetPage from './pages/FleetPage.jsx';
import RoutesPage from './pages/RoutesPage.jsx';
import RouteDetailPage from './pages/RouteDetailPage.jsx';
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

function Application() {
  const { pathname } = useLocation();
  const [tokenVersion, setTokenVersion] = useState(0);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [title, subtitle] = titleFor(pathname);

  // El globo del sidebar cuenta lo que alguien todavia tiene que atender:
  // ABIERTA y EN_ATENCION. Las resueltas ya no le piden nada a nadie.
  const countAlerts = useCallback(() => {
    fetchAlerts()
      .then((alerts) => setOpenAlerts(alerts.filter((a) => a.estado !== 'RESUELTA').length))
      .catch(() => setOpenAlerts(0));
  }, []);

  useEffect(() => {
    countAlerts();
  }, [countAlerts, tokenVersion, pathname]);

  const onTokenChange = () => setTokenVersion((v) => v + 1);

  return (
    <Shell title={title} subtitle={subtitle} openAlerts={openAlerts} onTokenChange={onTokenChange}>
      <Routes>
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
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Application />
    </BrowserRouter>
  );
}
