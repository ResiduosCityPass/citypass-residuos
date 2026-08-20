import { EstadoContenedor, EstadoSensor, Severidad } from '../../../../shared/domain/enums';

/**
 * Reglas de negocio de CU-05 y CU-06.
 *
 * Este archivo no importa NestJS, TypeORM ni nada del framework: son funciones
 * puras sobre numeros. Es lo que permite testear el corazon del modulo sin base
 * de datos ni contenedor de inyeccion.
 */

export interface UmbralesZona {
  umbralCriticoPct: number;
  umbralTemperaturaC: number;
}

export interface Medicion {
  nivelLlenadoPct: number;
  temperaturaC: number;
}

/** Margen por debajo del umbral critico donde el contenedor pasa a amarillo. */
export const MARGEN_ADVERTENCIA_PCT_DEFAULT = 10;

/**
 * CU-05 · Determina el color del contenedor comparando la medicion contra el
 * umbral configurado en su zona.
 *
 * Un contenedor fuera de servicio no cambia de estado por una lectura: sigue
 * fuera de servicio hasta que un administrador lo reactive.
 */
export function evaluarEstadoContenedor(
  medicion: Medicion,
  umbrales: UmbralesZona,
  estadoActual: EstadoContenedor,
  margenAdvertenciaPct: number = MARGEN_ADVERTENCIA_PCT_DEFAULT,
): EstadoContenedor {
  if (estadoActual === EstadoContenedor.FUERA_DE_SERVICIO) {
    return EstadoContenedor.FUERA_DE_SERVICIO;
  }

  if (medicion.nivelLlenadoPct >= umbrales.umbralCriticoPct) {
    return EstadoContenedor.CRITICO;
  }

  if (medicion.nivelLlenadoPct >= umbrales.umbralCriticoPct - margenAdvertenciaPct) {
    return EstadoContenedor.ADVERTENCIA;
  }

  return EstadoContenedor.NORMAL;
}

/**
 * CU-05 · La alerta y el evento se emiten SOLO en la transicion a critico.
 *
 * Si el contenedor ya estaba en rojo y llega otra lectura alta, no se vuelve a
 * emitir nada. Sin esta verificacion, un contenedor saturado inunda el bus con
 * una alerta cada 15 minutos.
 */
export function esTransicionACritico(
  estadoAnterior: EstadoContenedor,
  estadoNuevo: EstadoContenedor,
): boolean {
  return estadoNuevo === EstadoContenedor.CRITICO && estadoAnterior !== EstadoContenedor.CRITICO;
}

/** CU-06 · Riesgo de incendio: alguien tiro brasas o hay una quema dentro del contenedor. */
export function hayRiesgoDeIncendio(medicion: Medicion, umbrales: UmbralesZona): boolean {
  return medicion.temperaturaC >= umbrales.umbralTemperaturaC;
}

/**
 * Severidad de la alerta de saturacion, segun cuanto se paso del umbral.
 * Sirve para que el operador priorice entre veinte contenedores en rojo.
 */
export function severidadPorSaturacion(nivelLlenadoPct: number, umbralPct: number): Severidad {
  const exceso = nivelLlenadoPct - umbralPct;

  if (nivelLlenadoPct >= 100) return Severidad.CRITICA;
  if (exceso >= 15) return Severidad.ALTA;
  if (exceso >= 5) return Severidad.MEDIA;

  return Severidad.BAJA;
}

export const BATERIA_BAJA_PCT = 20;

/** Estado del sensor derivado de su nivel de bateria reportado. */
export function estadoSensorPorBateria(bateriaPct: number): EstadoSensor {
  return bateriaPct <= BATERIA_BAJA_PCT ? EstadoSensor.BATERIA_BAJA : EstadoSensor.ACTIVO;
}
