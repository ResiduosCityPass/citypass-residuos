import { colorForState } from '../../domain/states.js';

/**
 * Barra de llenado con la marca del umbral de la zona.
 *
 * La marca es el punto entero del componente: "94% sobre un umbral de 70" se
 * entiende de un vistazo, "94%" solo no dice si eso esta bien o mal. El umbral
 * lo define la zona, asi que el mismo 78% puede ser critico en Centro (umbral
 * 70) y normal en Chacarita (umbral 85).
 */
export default function FillBar({ levelPct, thresholdPct, state, compact = false }) {
  const color = colorForState(state);
  return (
    <div className={`fill-bar ${compact ? 'fill-bar-compact' : ''}`}>
      <div className="fill-bar-value" style={{ width: `${Math.min(levelPct, 100)}%`, background: color }} />
      {thresholdPct != null && (
        <div
          className="fill-bar-threshold"
          style={{ left: `${thresholdPct}%` }}
          title={`Umbral de la zona: ${thresholdPct}%`}
        />
      )}
    </div>
  );
}
