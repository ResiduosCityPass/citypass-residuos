/**
 * Enumeraciones compartidas del dominio de Residuos.
 * Ver docs/arquitectura/modelo-de-datos.md
 */

export enum TipoResiduo {
  COMUN = 'COMUN',
  RECICLABLE = 'RECICLABLE',
  ORGANICO = 'ORGANICO',
}

export enum EstadoContenedor {
  /** Verde en el mapa (CU-07) */
  NORMAL = 'NORMAL',
  /** Amarillo: se acerca al umbral pero todavia no lo supera */
  ADVERTENCIA = 'ADVERTENCIA',
  /** Rojo: supero el umbral de la zona (CU-05) */
  CRITICO = 'CRITICO',
  FUERA_DE_SERVICIO = 'FUERA_DE_SERVICIO',
}

export enum EstadoSensor {
  ACTIVO = 'ACTIVO',
  SIN_SENAL = 'SIN_SENAL',
  BATERIA_BAJA = 'BATERIA_BAJA',
  INACTIVO = 'INACTIVO',
}

export enum TipoAlerta {
  SATURACION = 'SATURACION',
  INCENDIO = 'INCENDIO',
  SENSOR_CAIDO = 'SENSOR_CAIDO',
  BATERIA_BAJA = 'BATERIA_BAJA',
}

export enum Severidad {
  BAJA = 'BAJA',
  MEDIA = 'MEDIA',
  ALTA = 'ALTA',
  CRITICA = 'CRITICA',
}

export enum EstadoAlerta {
  ABIERTA = 'ABIERTA',
  EN_ATENCION = 'EN_ATENCION',
  RESUELTA = 'RESUELTA',
}

export enum EstadoCamion {
  DISPONIBLE = 'DISPONIBLE',
  EN_RUTA = 'EN_RUTA',
  MANTENIMIENTO = 'MANTENIMIENTO',
}

export enum EstadoRuta {
  /** Generada por el planificador, todavia sin confirmar por el operador (CU-08) */
  PROPUESTA = 'PROPUESTA',
  ASIGNADA = 'ASIGNADA',
  EN_CURSO = 'EN_CURSO',
  COMPLETADA = 'COMPLETADA',
  CANCELADA = 'CANCELADA',
}

export enum EstadoParada {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADA = 'CONFIRMADA',
  OMITIDA = 'OMITIDA',
}

/**
 * Roles de la plataforma. Los grupos (`groups`) del JWT emitido por el Squad 2
 * se mapean contra estos valores -- ver auth/grupo-rol.map.ts y ADR-005.
 */
export enum Rol {
  ADMINISTRADOR = 'ADMINISTRADOR',
  OPERADOR = 'OPERADOR',
  CHOFER = 'CHOFER',
  CIUDADANO = 'CIUDADANO',
}
