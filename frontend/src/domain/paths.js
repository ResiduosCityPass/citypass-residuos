/**
 * Comparacion de rutas del navegador, por segmento y no por texto.
 *
 * Existe por un error que costo caro y no lo vio ningun test: `/choferes`
 * empieza con `/chofer`. Cualquier `pathname.startsWith('/chofer')` da true en
 * la pantalla de ABM del operador, que no tiene nada que ver con la del chofer
 * en la calle. El sintoma era un 403 en toda la pantalla de CU-09 —con cara de
 * problema de permisos— porque `seedDevToken` le dejaba puesto el token de
 * CHOFER.
 *
 * `matchesPath` compara el prefijo SOLO si lo que sigue es un `/` o el final
 * de la ruta. Asi `/chofer` matchea `/chofer` y `/chofer/loquesea`, pero nunca
 * `/choferes`.
 *
 * @param {string} pathname - Ruta actual del navegador.
 * @param {string} route - Ruta base contra la que se compara.
 */
export function matchesPath(pathname, route) {
  const value = String(pathname ?? '');
  if (value === route) return true;
  return value.startsWith(`${route}/`);
}

/** True si `pathname` esta bajo alguna de `routes`. */
export const matchesAnyPath = (pathname, routes = []) =>
  routes.some((route) => matchesPath(pathname, route));
