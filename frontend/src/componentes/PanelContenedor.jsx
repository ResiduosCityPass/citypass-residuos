import { useEffect, useState } from 'react';
import { obtenerContenedor, obtenerAlertas } from '../api/residuos.js';
import { colorDeEstado, ETIQUETA_ESTADO, ETIQUETA_TIPO_RESIDUO, haceCuanto } from '../dominio/estados.js';

/**
 * Panel de detalle. El payload del mapa es flaco a proposito, asi que al hacer
 * click pedimos GET /contenedores/:id, que trae `zona` y `sensor` anidados.
 */
export default function PanelContenedor({ contenedorId, onCerrar, refrescadoEn }) {
  const [contenedor, setContenedor] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  // App monta este panel con key={contenedorId}, asi que cambiar de contenedor
  // remonta el componente y el estado arranca limpio sin resetearlo a mano.
  useEffect(() => {
    let vigente = true;

    Promise.all([obtenerContenedor(contenedorId), obtenerAlertas({ contenedorId })])
      .then(([detalle, susAlertas]) => {
        if (!vigente) return;
        setContenedor(detalle);
        setAlertas(susAlertas);
      })
      .catch((e) => vigente && setError(e))
      .finally(() => vigente && setCargando(false));

    return () => {
      vigente = false;
    };
    // `refrescadoEn` cambia en cada tick del polling: asi el panel abierto no
    // queda mostrando datos viejos mientras el mapa ya se actualizo.
  }, [contenedorId, refrescadoEn]);

  if (cargando) return <aside className="panel"><p className="tenue">Cargando…</p></aside>;

  if (error) {
    return (
      <aside className="panel">
        <button className="cerrar" onClick={onCerrar}>×</button>
        <p className="error">{error.mensaje}</p>
      </aside>
    );
  }

  const umbral = contenedor.zona.umbralCriticoPct;
  const abiertas = alertas.filter((a) => a.estado !== 'RESUELTA');

  return (
    <aside className="panel">
      <button className="cerrar" onClick={onCerrar}>×</button>

      <h2>{contenedor.codigo}</h2>
      <span className="chip" style={{ background: colorDeEstado(contenedor.estado) }}>
        {ETIQUETA_ESTADO[contenedor.estado]}
      </span>

      {/* "94% sobre un umbral de 70" se entiende mucho mejor que solo "94%". */}
      <div className="barra">
        <div
          className="barra-relleno"
          style={{ width: `${contenedor.nivelLlenadoPct}%`, background: colorDeEstado(contenedor.estado) }}
        />
        <div className="barra-umbral" style={{ left: `${umbral}%` }} title={`Umbral de la zona: ${umbral}%`} />
      </div>
      <p className="tenue barra-pie">
        {contenedor.nivelLlenadoPct}% de llenado · umbral de {contenedor.zona.nombre}: {umbral}%
      </p>

      <dl className="datos">
        <dt>Zona</dt>
        <dd>{contenedor.zona.nombre}{contenedor.zona.bloqueada && <span className="chip-mini">bloqueada</span>}</dd>

        <dt>Residuo</dt>
        <dd>{ETIQUETA_TIPO_RESIDUO[contenedor.tipoResiduo]}</dd>

        <dt>Capacidad</dt>
        <dd>{contenedor.capacidadLitros} L</dd>

        <dt>Temperatura</dt>
        <dd>
          {contenedor.temperaturaC === null ? '—' : `${contenedor.temperaturaC} °C`}
          <span className="tenue"> (umbral {contenedor.zona.umbralTemperaturaC} °C)</span>
        </dd>

        <dt>Ultima lectura</dt>
        <dd>{haceCuanto(contenedor.ultimaLecturaEn)}</dd>

        <dt>Sensor</dt>
        <dd>
          {contenedor.sensor ? (
            <>
              {contenedor.sensor.codigo} · {contenedor.sensor.estado} · bateria {contenedor.sensor.bateriaPct}%
            </>
          ) : (
            /* Sin sensor no hay lecturas, y sin lecturas el estado no cambia nunca. */
            <span className="advertencia">Sin sensor vinculado — este contenedor no reporta</span>
          )}
        </dd>
      </dl>

      <h3>Alertas ({abiertas.length} sin resolver)</h3>
      {alertas.length === 0 && <p className="tenue">Ninguna alerta registrada.</p>}
      <ul className="alertas">
        {alertas.map((alerta) => (
          <li key={alerta.id} className={`alerta alerta-${alerta.estado.toLowerCase()}`}>
            <div className="alerta-cabecera">
              <strong>{alerta.tipo}</strong>
              <span className={`chip-mini sev-${alerta.severidad.toLowerCase()}`}>{alerta.severidad}</span>
              <span className="tenue">{alerta.estado}</span>
            </div>
            {/* `detalle` viene ya redactado para el operador: se muestra tal cual. */}
            <p>{alerta.detalle}</p>
            <span className="tenue">{haceCuanto(alerta.detectadaEn)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
