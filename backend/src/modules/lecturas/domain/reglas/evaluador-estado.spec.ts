import { EstadoContenedor, EstadoSensor, Severidad } from '../../../../shared/domain/enums';
import {
  esTransicionACritico,
  estadoSensorPorBateria,
  evaluarEstadoContenedor,
  hayRiesgoDeIncendio,
  severidadPorSaturacion,
} from './evaluador-estado';

const umbrales = { umbralCriticoPct: 70, umbralTemperaturaC: 60 };
const medicion = (nivelLlenadoPct: number, temperaturaC = 22) => ({
  nivelLlenadoPct,
  temperaturaC,
});

describe('evaluarEstadoContenedor', () => {
  it('devuelve NORMAL bien por debajo del umbral', () => {
    expect(evaluarEstadoContenedor(medicion(30), umbrales, EstadoContenedor.NORMAL)).toBe(
      EstadoContenedor.NORMAL,
    );
  });

  it('devuelve ADVERTENCIA cuando entra en el margen previo al umbral', () => {
    expect(evaluarEstadoContenedor(medicion(62), umbrales, EstadoContenedor.NORMAL)).toBe(
      EstadoContenedor.ADVERTENCIA,
    );
  });

  it('devuelve CRITICO exactamente en el umbral, no solo por encima', () => {
    expect(evaluarEstadoContenedor(medicion(70), umbrales, EstadoContenedor.NORMAL)).toBe(
      EstadoContenedor.CRITICO,
    );
  });

  it('respeta el umbral propio de cada zona', () => {
    const zonaBajaDensidad = { umbralCriticoPct: 85, umbralTemperaturaC: 60 };

    expect(
      evaluarEstadoContenedor(medicion(80), zonaBajaDensidad, EstadoContenedor.NORMAL),
    ).not.toBe(EstadoContenedor.CRITICO);
    expect(evaluarEstadoContenedor(medicion(80), umbrales, EstadoContenedor.NORMAL)).toBe(
      EstadoContenedor.CRITICO,
    );
  });

  it('no saca de FUERA_DE_SERVICIO a un contenedor por una lectura', () => {
    expect(
      evaluarEstadoContenedor(medicion(10), umbrales, EstadoContenedor.FUERA_DE_SERVICIO),
    ).toBe(EstadoContenedor.FUERA_DE_SERVICIO);
  });

  it('acepta un margen de advertencia configurable', () => {
    expect(evaluarEstadoContenedor(medicion(50), umbrales, EstadoContenedor.NORMAL, 25)).toBe(
      EstadoContenedor.ADVERTENCIA,
    );
  });
});

describe('esTransicionACritico', () => {
  it('es true al pasar de normal a critico', () => {
    expect(esTransicionACritico(EstadoContenedor.NORMAL, EstadoContenedor.CRITICO)).toBe(true);
  });

  it('es true al pasar de advertencia a critico', () => {
    expect(esTransicionACritico(EstadoContenedor.ADVERTENCIA, EstadoContenedor.CRITICO)).toBe(true);
  });

  it('es false si ya estaba critico, para no duplicar la alerta', () => {
    expect(esTransicionACritico(EstadoContenedor.CRITICO, EstadoContenedor.CRITICO)).toBe(false);
  });

  it('es false cuando el contenedor deja de estar critico', () => {
    expect(esTransicionACritico(EstadoContenedor.CRITICO, EstadoContenedor.NORMAL)).toBe(false);
  });
});

describe('hayRiesgoDeIncendio', () => {
  it('detecta la temperatura por encima del umbral', () => {
    expect(hayRiesgoDeIncendio(medicion(20, 78), umbrales)).toBe(true);
  });

  it('dispara exactamente en el umbral', () => {
    expect(hayRiesgoDeIncendio(medicion(20, 60), umbrales)).toBe(true);
  });

  it('no dispara con temperatura ambiente de verano', () => {
    expect(hayRiesgoDeIncendio(medicion(20, 38), umbrales)).toBe(false);
  });
});

describe('severidadPorSaturacion', () => {
  it('marca CRITICA el contenedor desbordado', () => {
    expect(severidadPorSaturacion(100, 70)).toBe(Severidad.CRITICA);
  });

  it('marca ALTA cuando se paso holgadamente del umbral', () => {
    expect(severidadPorSaturacion(88, 70)).toBe(Severidad.ALTA);
  });

  it('marca MEDIA con un exceso moderado', () => {
    expect(severidadPorSaturacion(77, 70)).toBe(Severidad.MEDIA);
  });

  it('marca BAJA cuando recien cruza el umbral', () => {
    expect(severidadPorSaturacion(71, 70)).toBe(Severidad.BAJA);
  });
});

describe('estadoSensorPorBateria', () => {
  it('marca BATERIA_BAJA en el limite', () => {
    expect(estadoSensorPorBateria(20)).toBe(EstadoSensor.BATERIA_BAJA);
  });

  it('deja ACTIVO al sensor con carga suficiente', () => {
    expect(estadoSensorPorBateria(64)).toBe(EstadoSensor.ACTIVO);
  });
});
