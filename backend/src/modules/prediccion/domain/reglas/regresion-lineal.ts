/**
 * CU-12 · Nucleo del modelo predictivo.
 *
 * Regresion lineal por minimos cuadrados sobre el historico de lecturas de un
 * contenedor: ajusta la recta nivel = pendiente * horas + ordenada, y usa la
 * pendiente como tasa de llenado.
 *
 * Igual que el evaluador de CU-05, este archivo no importa NestJS, TypeORM ni
 * nada del framework: son funciones puras sobre numeros. Es lo que permite
 * testear el modelo sin base de datos.
 *
 * Por que una regresion lineal y no algo mas sofisticado: en el horizonte que
 * importa —las horas que faltan para el proximo turno de recoleccion— el llenado
 * de un contenedor es practicamente lineal. Modelar estacionalidad semanal o
 * usar series temporales agregaria complejidad sin cambiar la decision operativa,
 * que es solo "hay que pasar hoy o puede esperar". Ver ADR-004.
 */

export interface Muestra {
  /** Momento de la medicion. */
  registradaEn: Date;
  nivelLlenadoPct: number;
}

export interface Ajuste {
  /** Puntos porcentuales de llenado por hora. */
  pendientePctPorHora: number;
  ordenadaPct: number;
  /** Coeficiente de determinacion R^2, entre 0 y 1. Es la confianza del ajuste. */
  r2: number;
  muestrasUsadas: number;
}

/** Menos de tres puntos no definen una tendencia, solo una recta entre dos ruidos. */
export const MIN_MUESTRAS = 3;

/**
 * Caida de nivel que se interpreta como un vaciado y no como ruido del sensor.
 *
 * Importa mas de lo que parece: si la ventana de lecturas cruza un vaciado, la
 * recta se ajusta sobre una serie que sube, cae a cero y vuelve a subir. La
 * pendiente resultante no describe nada real.
 */
export const CAIDA_QUE_INDICA_VACIADO_PCT = 20;

/**
 * Se queda con las lecturas posteriores al ultimo vaciado.
 *
 * Recibe las muestras ordenadas de la mas vieja a la mas nueva y devuelve el
 * tramo del ciclo de llenado actual, que es el unico sobre el que tiene sentido
 * ajustar una recta.
 */
export function recortarAlCicloActual(muestras: Muestra[]): Muestra[] {
  for (let i = muestras.length - 1; i > 0; i--) {
    const caida = muestras[i - 1].nivelLlenadoPct - muestras[i].nivelLlenadoPct;

    if (caida >= CAIDA_QUE_INDICA_VACIADO_PCT) {
      return muestras.slice(i);
    }
  }

  return muestras;
}

/**
 * Ajusta la recta por minimos cuadrados. Devuelve null si no hay suficientes
 * puntos o si todas las lecturas comparten el mismo instante, que dejaria la
 * pendiente indefinida.
 */
export function ajustarRecta(muestras: Muestra[]): Ajuste | null {
  if (muestras.length < MIN_MUESTRAS) {
    return null;
  }

  const origenMs = muestras[0].registradaEn.getTime();
  const puntos = muestras.map((m) => ({
    x: (m.registradaEn.getTime() - origenMs) / 3_600_000,
    y: m.nivelLlenadoPct,
  }));

  const n = puntos.length;
  const promedioX = puntos.reduce((acc, p) => acc + p.x, 0) / n;
  const promedioY = puntos.reduce((acc, p) => acc + p.y, 0) / n;

  let covarianza = 0;
  let varianzaX = 0;

  for (const p of puntos) {
    covarianza += (p.x - promedioX) * (p.y - promedioY);
    varianzaX += (p.x - promedioX) ** 2;
  }

  // Todas las lecturas en el mismo instante: no hay eje temporal sobre el cual
  // ajustar nada.
  if (varianzaX === 0) {
    return null;
  }

  const pendiente = covarianza / varianzaX;
  const ordenada = promedioY - pendiente * promedioX;

  let sumaResiduos = 0;
  let sumaTotal = 0;

  for (const p of puntos) {
    sumaResiduos += (p.y - (pendiente * p.x + ordenada)) ** 2;
    sumaTotal += (p.y - promedioY) ** 2;
  }

  // Si todas las lecturas traen el mismo nivel, el ajuste es perfecto pero no
  // describe ninguna tendencia. Se reporta confianza 0 en vez de 1: decir que
  // una recta plana predice con certeza cuando se satura seria mentir.
  const r2 = sumaTotal === 0 ? 0 : 1 - sumaResiduos / sumaTotal;

  return {
    pendientePctPorHora: pendiente,
    ordenadaPct: ordenada,
    r2: Math.max(0, Math.min(1, r2)),
    muestrasUsadas: n,
  };
}

/**
 * Horas que faltan para cruzar el umbral, segun la tasa de llenado ajustada.
 *
 * Devuelve 0 si el contenedor ya esta en el umbral o por encima, y null si la
 * tendencia no es creciente: un contenedor que no se llena no va a saturarse
 * nunca, y devolver un numero ahi seria inventar un futuro.
 */
export function horasHastaUmbral(
  nivelActualPct: number,
  umbralPct: number,
  pendientePctPorHora: number,
): number | null {
  if (nivelActualPct >= umbralPct) {
    return 0;
  }

  if (pendientePctPorHora <= 0) {
    return null;
  }

  return (umbralPct - nivelActualPct) / pendientePctPorHora;
}
