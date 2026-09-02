/**
 * Copia sobre la entidad solo las claves que traen un valor.
 *
 * Reemplaza a `Object.assign(entidad, dto)` en los PATCH parciales. El problema
 * de Object.assign es que copia tambien las claves con valor `undefined`, y un
 * DTO puede tenerlas: con `useDefineForClassFields` —activo por defecto para
 * target ES2022 en adelante— una propiedad opcional declarada en el cuerpo de la
 * clase existe como propiedad propia inicializada en `undefined`, aunque el
 * request no la haya mandado.
 *
 * El sintoma es silencioso: el UPDATE de TypeORM ignora las columnas undefined,
 * asi que la base queda bien, pero la entidad en memoria pierde el campo y la
 * respuesta del PATCH sale sin el. El cliente que use esa respuesta para
 * refrescar su estado se queda sin el dato.
 */
export function aplicarCambios<T extends object>(entidad: T, cambios: object): T {
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor !== undefined) {
      (entidad as Record<string, unknown>)[clave] = valor;
    }
  }

  return entidad;
}
