/**
 * Etiqueta redondeada para estados, severidades y tipos.
 *
 * `color` acepta un hexadecimal directo para el caso del estado del contenedor,
 * que sale de COLOR_BY_STATE en domain/states.js y no de una variante fija.
 */
export default function Chip({ variant = 'neutral', color, children, ...rest }) {
  const style = color ? { background: color, color: '#fff', borderColor: color } : undefined;
  return (
    <span className={`chip chip-${variant}`} style={style} {...rest}>
      {children}
    </span>
  );
}
