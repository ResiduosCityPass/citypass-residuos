/**
 * Las cinco variantes del design system de CityPass+: primaria, secundaria,
 * exito, advertencia y peligro.
 *
 * `disabledReason` es la razon por la que el boton esta deshabilitado. Se
 * muestra como tooltip: un boton gris sin explicacion es una pared, uno que
 * dice por que no se puede tocar es informacion.
 */
export default function Button({
  variant = 'primary',
  size = 'normal',
  disabledReason,
  disabled,
  children,
  ...rest
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-${size}`}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
