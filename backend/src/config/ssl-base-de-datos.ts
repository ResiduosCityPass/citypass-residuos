/**
 * Configuracion TLS de la conexion a PostgreSQL.
 *
 * En local la base corre en el mismo Docker y no usa TLS. Los Postgres
 * administrados de la nube si lo exigen, y sin esto el arranque falla con
 * "The server does not support SSL connections" o el cliente corta la conexion.
 *
 * `rejectUnauthorized: false` no desactiva el cifrado: el trafico sigue
 * yendo por TLS. Lo que desactiva es la validacion de la cadena del
 * certificado, porque los proveedores administrados firman con una CA propia
 * que no esta en el almacen de confianza del contenedor. La alternativa
 * correcta es montar el certificado de la CA del proveedor y validar contra el;
 * queda anotado como deuda en el documento de despliegue.
 */
export function sslDeBaseDeDatos(valor: string | undefined) {
  return valor === 'true' ? { rejectUnauthorized: false } : false;
}
