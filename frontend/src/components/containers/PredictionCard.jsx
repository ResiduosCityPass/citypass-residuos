import { useEffect, useState } from 'react';
import Chip from '../ui/Chip.jsx';
import Notice from '../ui/Notice.jsx';
import { fetchPrediction } from '../../api/waste.js';
import { CONFIDENCE_FLOOR, confidenceLevel, formatHoursUntil } from '../../domain/states.js';

const CONFIDENCE_CHIP = { alta: 'success', media: 'info', baja: 'warning' };

/**
 * CU-12 · Prediccion de saturacion.
 *
 * Regresion lineal sobre el historico de lecturas: cuantas horas faltan para
 * que este contenedor cruce el umbral de su zona.
 *
 * La decision de diseno que manda aca es **no mostrar el titular solo**. Una
 * prediccion con confianza 0.44 y 26 muestras se ve igual de segura que una con
 * 0.93 y 300 si solo se muestra "se satura en 2,5 h", y sobre eso alguien
 * planifica un camion. Por eso la confianza va al lado del numero, no escondida
 * abajo, y por debajo de 0.5 la tarjeta lo dice con todas las letras.
 */
export default function PredictionCard({ containerId, thresholdPct }) {
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    fetchPrediction(containerId)
      .then((p) => current && setPrediction(p))
      .catch((e) => current && setError(e))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [containerId]);

  if (loading) return <p className="muted">Calculando prediccion…</p>;

  if (error) {
    // Sin historico no hay regresion posible. No es un fallo: es un contenedor
    // que todavia no dio datos, y decirlo asi evita que parezca un bug.
    return (
      <Notice type="info" title="Todavía no se puede predecir">
        {error.code === 'SIN_LECTURAS_SUFICIENTES'
          ? 'Hacen falta lecturas del sensor para estimar la tasa de llenado. En cuanto el contenedor empiece a reportar, la predicción aparece sola.'
          : error.message}
      </Notice>
    );
  }

  const level = confidenceLevel(prediction.confianza);
  const unreliable = prediction.confianza < CONFIDENCE_FLOOR;
  const alreadyOver = prediction.horasHastaUmbral <= 0;

  return (
    <div className="prediction">
      <div className="prediction-headline">
        <div>
          <span className="prediction-eta">
            {alreadyOver ? 'Umbral superado' : formatHoursUntil(prediction.horasHastaUmbral)}
          </span>
          <p className="muted">
            {alreadyOver
              ? 'Ya está por encima del umbral de su zona: hay que recolectarlo.'
              : `Alcanza el ${thresholdPct}% el ${new Date(prediction.saturacionEstimadaEn).toLocaleString('es-AR', {
                  weekday: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`}
          </p>
        </div>
        <Chip variant={CONFIDENCE_CHIP[level]}>confianza {level}</Chip>
      </div>

      {/* Proyeccion: donde esta hoy y donde esta el umbral. La franja gris entre
          los dos es lo que la prediccion dice que falta recorrer. */}
      <div className="prediction-track" style={{ '--threshold': `${thresholdPct}%` }}>
        <div className="prediction-now" style={{ width: `${Math.min(prediction.nivelActualPct, 100)}%` }} />
        <div className="prediction-threshold" />
      </div>
      <div className="prediction-scale muted">
        <span>{prediction.nivelActualPct}% hoy</span>
        <span>umbral {thresholdPct}%</span>
      </div>

      <dl className="data-list">
        <dt>Tasa de llenado</dt>
        <dd className="mono">{prediction.tasaLlenadoPctPorHora}% por hora</dd>
        <dt>Muestras usadas</dt>
        <dd className="mono">{prediction.muestrasUsadas} lecturas</dd>
        <dt>Confianza</dt>
        <dd className="mono">{Math.round(prediction.confianza * 100)}%</dd>
      </dl>

      {unreliable && (
        <Notice type="warning" title="No planifiques con este número">
          La regresión tiene una confianza de {Math.round(prediction.confianza * 100)}%, por debajo
          del {Math.round(CONFIDENCE_FLOOR * 100)}% que hace falta para que la estimación sirva.
          Suele pasar cuando el contenedor se llena de forma irregular o hay pocas lecturas.
        </Notice>
      )}
    </div>
  );
}
