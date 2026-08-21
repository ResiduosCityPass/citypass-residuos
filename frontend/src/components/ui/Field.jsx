/**
 * Label + control + mensaje de error por campo.
 *
 * El error se muestra debajo del control y no en un cartel arriba del
 * formulario: cuando el backend rechaza cuatro campos a la vez, un cartel con
 * cuatro lineas obliga a adivinar cual es cual.
 */
export default function Field({ label, htmlFor, error, hint, required, children }) {
  return (
    <div className={`field ${error ? 'field-has-error' : ''}`}>
      <label htmlFor={htmlFor}>
        {label}
        {required && <span className="field-required" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
