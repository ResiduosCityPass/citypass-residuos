import {
  MIN_MUESTRAS,
  Muestra,
  ajustarRecta,
  horasHastaUmbral,
  recortarAlCicloActual,
} from './reglas/regresion-lineal';

/**
 * CU-12 · Evaluacion del modelo de prediccion.
 *
 * Mide cuantas horas se equivoca la regresion al estimar cuando un contenedor
 * cruza el umbral, y lo compara con dos estimaciones sencillas. Usa datos
 * separados en el tiempo: en cada corte, el modelo solo ve las lecturas hasta
 * ese momento, y el resultado se compara con lo que pasa despues.
 *
 * Los datos son sinteticos, con una semilla fija para que el resultado sea
 * reproducible. No hace falta base de datos ni tocar produccion.
 */

/** Los sensores reportan cada 15 minutos (CU-04). */
export const INTERVALO_HORAS = 0.25;

/** Generador pseudoaleatorio con semilla (mulberry32): misma semilla, mismos datos. */
export function azarConSemilla(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface Escenario {
  nombre: string;
  descripcion: string;
  /** Puntos porcentuales que sube el nivel real entre dos lecturas. */
  incremento: (azar: () => number, horaDelDia: number) => number;
  /** Error del sensor en una lectura, en puntos porcentuales. */
  ruidoLectura: (azar: () => number) => number;
}

export const ESCENARIOS: Escenario[] = [
  {
    nombre: 'simulador',
    descripcion:
      'El de simulator/simulador.js: sube entre 0,5 y 3 puntos por lectura, sin error del sensor',
    incremento: (azar) => 0.5 + azar() * 2.5,
    ruidoLectura: () => 0,
  },
  {
    nombre: 'ritmo-diario',
    descripcion: 'El ritmo cambia con la hora: casi nulo de madrugada y el doble a la tarde',
    incremento: (azar, hora) =>
      Math.max(0, 1.75 * (1 + 0.9 * Math.sin((2 * Math.PI * (hora - 10)) / 24)) + (azar() - 0.5)),
    ruidoLectura: () => 0,
  },
  {
    nombre: 'sensor-ruidoso',
    descripcion: 'Como el simulador, pero cada lectura tiene un error de hasta ±4 puntos',
    incremento: (azar) => 0.5 + azar() * 2.5,
    ruidoLectura: (azar) => (azar() - 0.5) * 8,
  },
];

export interface Ciclo {
  /** Lo que reporta el sensor. */
  lecturas: Muestra[];
  /** Hora real en la que el nivel cruza el umbral (sin error del sensor). */
  cruceEn: Date;
}

/**
 * Un ciclo de llenado: desde el nivel inicial hasta pasar el umbral. El cruce
 * real se interpola entre las dos lecturas que lo rodean.
 */
export function generarCiclo(
  escenario: Escenario,
  azar: () => number,
  nivelInicialPct: number,
  umbralPct: number,
  inicio: Date,
): Ciclo {
  const lecturas: Muestra[] = [];
  let nivel = nivelInicialPct;
  let t = inicio.getTime();

  for (;;) {
    const leido = Math.min(100, Math.max(0, nivel + escenario.ruidoLectura(azar)));
    lecturas.push({ registradaEn: new Date(t), nivelLlenadoPct: leido });

    const hora = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
    const siguiente = nivel + escenario.incremento(azar, hora);

    if (siguiente >= umbralPct) {
      const fraccion = (umbralPct - nivel) / (siguiente - nivel);
      return { lecturas, cruceEn: new Date(t + fraccion * INTERVALO_HORAS * 3_600_000) };
    }

    nivel = siguiente;
    t += INTERVALO_HORAS * 3_600_000;
  }
}

/** Devuelve la tasa de llenado estimada en puntos por hora, o null si no puede. */
export type Estimador = (entrenamiento: Muestra[]) => number | null;

const horasEntre = (a: Muestra, b: Muestra) =>
  (b.registradaEn.getTime() - a.registradaEn.getTime()) / 3_600_000;

export const ESTIMADORES: Record<string, Estimador> = {
  /** El modelo de CU-12, igual que en PrediccionService. */
  regresion: (m) => ajustarRecta(recortarAlCicloActual(m))?.pendientePctPorHora ?? null,
  /** Sencilla: el ritmo entre las dos ultimas lecturas. */
  'ultimo-tramo': (m) => {
    const [a, b] = m.slice(-2);
    return (b.nivelLlenadoPct - a.nivelLlenadoPct) / horasEntre(a, b);
  },
  /** Sencilla: el ritmo promedio entre la primera y la ultima lectura. */
  'primera-y-ultima': (m) =>
    (m[m.length - 1].nivelLlenadoPct - m[0].nivelLlenadoPct) / horasEntre(m[0], m[m.length - 1]),
};

export interface Errores {
  /** Cortes en los que se pidio una prediccion. */
  cortes: number;
  /** Fraccion de cortes en los que el estimador devolvio una prediccion. */
  cobertura: number;
  /** Error absoluto medio, en horas. */
  mae: number;
  /** Raiz del error cuadratico medio, en horas. */
  rmse: number;
  /** Fraccion de predicciones que erraron por una hora o menos. */
  dentroDeUnaHora: number;
  /**
   * MAE de los cortes a 6 h o menos del cruce real: el horizonte en el que se
   * decide si el camion pasa hoy.
   */
  maeUltimas6h: number;
}

/** Horizonte operativo: lo que satura dentro de un turno. */
export const HORIZONTE_OPERATIVO_HORAS = 6;

const promedioAbsoluto = (xs: number[]) =>
  xs.length === 0 ? NaN : xs.reduce((s, e) => s + Math.abs(e), 0) / xs.length;

/**
 * En cada ciclo, corta despues de cada lectura (desde la minima que necesita la
 * regresion), predice con lo anterior y compara con el cruce real.
 */
export function evaluar(ciclos: Ciclo[], umbralPct: number, estimador: Estimador): Errores {
  const errores: number[] = [];
  const erroresCercanos: number[] = [];
  let cortes = 0;

  for (const { lecturas, cruceEn } of ciclos) {
    for (let k = MIN_MUESTRAS; k <= lecturas.length; k++) {
      const entrenamiento = lecturas.slice(0, k);
      const ultima = entrenamiento[k - 1];
      cortes++;

      const tasa = estimador(entrenamiento);
      const horas =
        tasa === null ? null : horasHastaUmbral(ultima.nivelLlenadoPct, umbralPct, tasa);
      if (horas === null) continue;

      const reales = (cruceEn.getTime() - ultima.registradaEn.getTime()) / 3_600_000;
      errores.push(horas - reales);
      if (reales <= HORIZONTE_OPERATIVO_HORAS) erroresCercanos.push(horas - reales);
    }
  }

  const n = errores.length;
  return {
    cortes,
    cobertura: cortes === 0 ? 0 : n / cortes,
    mae: promedioAbsoluto(errores),
    rmse: n === 0 ? NaN : Math.sqrt(errores.reduce((s, e) => s + e * e, 0) / n),
    dentroDeUnaHora: n === 0 ? 0 : errores.filter((e) => Math.abs(e) <= 1).length / n,
    maeUltimas6h: promedioAbsoluto(erroresCercanos),
  };
}

/** Genera los ciclos de un escenario con nivel inicial entre 0 y 40%. */
export function generarCiclos(
  escenario: Escenario,
  cantidad: number,
  umbralPct: number,
  semilla: number,
): Ciclo[] {
  const azar = azarConSemilla(semilla);
  const inicio = Date.UTC(2026, 10, 1);

  return Array.from({ length: cantidad }, () =>
    generarCiclo(
      escenario,
      azar,
      azar() * 40,
      umbralPct,
      new Date(inicio + Math.floor(azar() * 96) * INTERVALO_HORAS * 3_600_000),
    ),
  );
}
