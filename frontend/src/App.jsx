import { useEffect, useMemo, useState } from 'react';
import BarraToken from './componentes/BarraToken.jsx';
import MapaContenedores from './componentes/MapaContenedores.jsx';
import PanelContenedor from './componentes/PanelContenedor.jsx';
import { useMapaEnVivo, INTERVALO_POLLING_MS } from './hooks/useMapaEnVivo.js';
import { obtenerZonas } from './api/residuos.js';
import { leerToken } from './api/cliente.js';
import { COLOR_POR_ESTADO, ETIQUETA_ESTADO, haceCuanto } from './dominio/estados.js';
import './App.css';

export default function App() {
  const [versionToken, setVersionToken] = useState(0);
  const [zonas, setZonas] = useState([]);
  const [filtros, setFiltros] = useState({ zonaId: '', tipoResiduo: '', estado: '' });
  const [seleccionadoId, setSeleccionadoId] = useState(null);

  const { contenedores, incendiosPorContenedor, cargando, error, actualizadoEn, refrescar } =
    useMapaEnVivo(filtros);

  // El <select> de zonas sale de CU-02.
  useEffect(() => {
    if (!leerToken()) return;
    obtenerZonas().then(setZonas).catch(() => setZonas([]));
  }, [versionToken]);

  const resumen = useMemo(() => {
    const conteo = { NORMAL: 0, ADVERTENCIA: 0, CRITICO: 0, FUERA_DE_SERVICIO: 0 };
    for (const c of contenedores) conteo[c.estado] = (conteo[c.estado] ?? 0) + 1;
    return conteo;
  }, [contenedores]);

  const cantidadIncendios = Object.keys(incendiosPorContenedor).length;

  const alCambiarToken = () => {
    setVersionToken((v) => v + 1);
    refrescar();
  };

  const cambiarFiltro = (campo) => (evento) =>
    setFiltros((previos) => ({ ...previos, [campo]: evento.target.value }));

  return (
    <div className="app">
      <header>
        <div>
          <h1>Mapa de contenedores</h1>
          <p className="tenue">
            CU-07 · se refresca solo cada {INTERVALO_POLLING_MS / 1000} s
            {actualizadoEn && ` · actualizado ${haceCuanto(actualizadoEn.toISOString())}`}
          </p>
        </div>
        <BarraToken onCambio={alCambiarToken} />
      </header>

      <div className="filtros">
        <select value={filtros.zonaId} onChange={cambiarFiltro('zonaId')}>
          <option value="">Todas las zonas</option>
          {zonas.map((zona) => (
            <option key={zona.id} value={zona.id}>
              {zona.nombre} (umbral {zona.umbralCriticoPct}%)
            </option>
          ))}
        </select>

        <select value={filtros.tipoResiduo} onChange={cambiarFiltro('tipoResiduo')}>
          <option value="">Todo tipo de residuo</option>
          <option value="COMUN">Comun</option>
          <option value="RECICLABLE">Reciclable</option>
          <option value="ORGANICO">Organico</option>
        </select>

        <select value={filtros.estado} onChange={cambiarFiltro('estado')}>
          <option value="">Todos los estados</option>
          {Object.keys(COLOR_POR_ESTADO).map((estado) => (
            <option key={estado} value={estado}>
              {ETIQUETA_ESTADO[estado]}
            </option>
          ))}
        </select>

        <button className="secundario" onClick={refrescar}>Refrescar ahora</button>

        <div className="leyenda">
          {Object.entries(COLOR_POR_ESTADO).map(([estado, color]) => (
            <span key={estado}>
              <i style={{ background: color }} />
              {ETIQUETA_ESTADO[estado]} ({resumen[estado] ?? 0})
            </span>
          ))}
          <span>
            <i className="i-incendio" />
            Incendio abierto ({cantidadIncendios})
          </span>
        </div>
      </div>

      {error && (
        <p className="error">
          {error.code === 'HTTP_401'
            ? 'Token ausente o vencido. Genera uno con: cd backend && npm run token:dev -- ADMINISTRADOR'
            : `[${error.code}] ${error.mensaje}`}
        </p>
      )}

      <main>
        <MapaContenedores
          contenedores={contenedores}
          incendios={incendiosPorContenedor}
          seleccionadoId={seleccionadoId}
          onSeleccionar={setSeleccionadoId}
        />
        {seleccionadoId && (
          <PanelContenedor
            key={seleccionadoId}
            contenedorId={seleccionadoId}
            refrescadoEn={actualizadoEn}
            onCerrar={() => setSeleccionadoId(null)}
          />
        )}
      </main>

      {cargando && <p className="tenue">Cargando contenedores…</p>}
      {!cargando && !error && contenedores.length === 0 && (
        <p className="tenue">
          No hay contenedores para estos filtros. Si nunca sembraste datos:
          cd simulator && TOKEN=&lt;tu-token&gt; npm run seed
        </p>
      )}
    </div>
  );
}
