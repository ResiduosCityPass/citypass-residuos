/**
 * Traduccion de los errores de la API a algo que un formulario pueda pintar.
 *
 * En HTTP_400 el backend manda `message` como array de strings, uno por campo,
 * con el nombre del campo al principio:
 *
 *   ["zonaId must be a UUID", "capacidadLitros must not be less than 1"]
 *
 * El cliente los conserva crudos en `error.details`. Aca se parte el nombre del
 * campo del resto para poder mostrar cada mensaje debajo del input que lo causo.
 */

/**
 * @param {import('../api/client.js').ApiError} error
 * @returns {Record<string, string>} campo -> mensaje. Vacio si no es de validacion.
 */
export function fieldErrors(error) {
  if (!error?.details) return {};

  const byField = {};
  for (const line of error.details) {
    const [field, ...rest] = line.split(' ');
    // Un campo puede fallar varias validaciones a la vez. Se muestra la primera:
    // arreglada esa, el backend devuelve la siguiente si todavia hay problema.
    if (rest.length > 0 && !byField[field]) byField[field] = rest.join(' ');
  }
  return byField;
}

/**
 * Texto para el usuario cuando el error no es de un campo puntual.
 *
 * Se ramifica por `code`, nunca por `message`: el mensaje esta en castellano y
 * puede cambiar sin aviso, el codigo es parte del contrato.
 */
export function generalMessage(error) {
  if (!error) return null;

  switch (error.code) {
    case 'HTTP_401':
      // Hasta que el Squad 2 publique el login federado, el token se genera a
      // mano. El mensaje lleva el comando exacto porque no hay otra forma de
      // conseguirlo y mandar a alguien a buscarlo a la documentacion es cruel.
      return 'Token ausente o vencido. Genera uno con: cd backend && npm run token:dev -- ADMINISTRADOR, y pegalo en el boton Token de la barra superior.';
    case 'PARADA_FUERA_DE_RADIO':
      // PROPUESTA de contrato: api-preliminar.md documenta el 403 de CU-10 pero
      // no le puso `code`. Va antes del HTTP_403 generico porque no es un
      // problema de permisos: el chofer tiene el rol, lo que no tiene es la
      // cercania. Decirle "no tenes permisos" lo manda a buscar un problema de
      // rol que no existe.
      return error.message;
    case 'HTTP_403':
      return `No tenes permisos para esta accion. ${error.message}`;
    case 'SIN_CONEXION':
      return error.message;
    case 'HTTP_400':
      // Los de validacion ya se muestran campo por campo; repetirlos arriba
      // duplica el ruido sin agregar informacion.
      return null;
    default:
      return error.message;
  }
}
