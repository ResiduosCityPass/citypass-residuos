import {
  CAIDA_QUE_INDICA_VACIADO_PCT,
  MIN_MUESTRAS,
  Muestra,
  ajustarRecta,
  horasHastaUmbral,
  recortarAlCicloActual,
} from './regresion-lineal';

const INICIO = new Date('2026-09-02T00:00:00.000Z');

/** Construye muestras espaciadas una hora, con los niveles indicados. */
const serie = (niveles: number[], horasEntre = 1): Muestra[] =>
  niveles.map((nivelLlenadoPct, i) => ({
    registradaEn: new Date(INICIO.getTime() + i * horasEntre * 3_600_000),
    nivelLlenadoPct,
  }));

describe('ajustarRecta', () => {
  it('recupera exactamente la pendiente de una serie perfectamente lineal', () => {
    const ajuste = ajustarRecta(serie([10, 15, 20, 25, 30]));

    expect(ajuste?.pendientePctPorHora).toBeCloseTo(5, 10);
    expect(ajuste?.ordenadaPct).toBeCloseTo(10, 10);
    expect(ajuste?.r2).toBeCloseTo(1, 10);
  });

  it('reporta confianza alta ante ruido chico', () => {
    const ajuste = ajustarRecta(serie([10, 14.6, 20.3, 24.8, 30.2]));

    expect(ajuste!.pendientePctPorHora).toBeGreaterThan(4);
    expect(ajuste!.r2).toBeGreaterThan(0.95);
  });

  it('reporta confianza baja ante una serie erratica', () => {
    const ajuste = ajustarRecta(serie([10, 60, 15, 55, 20, 50]));

    expect(ajuste!.r2).toBeLessThan(0.5);
  });

  it('respeta el espaciado real entre lecturas, no su cantidad', () => {
    // Mismos niveles, pero cada 15 minutos: la tasa por hora es cuatro veces mayor.
    const porHora = ajustarRecta(serie([10, 20, 30, 40], 1));
    const cadaCuarto = ajustarRecta(serie([10, 20, 30, 40], 0.25));

    expect(porHora?.pendientePctPorHora).toBeCloseTo(10, 6);
    expect(cadaCuarto?.pendientePctPorHora).toBeCloseTo(40, 6);
  });

  it('detecta pendiente negativa cuando el contenedor se vacia de a poco', () => {
    expect(ajustarRecta(serie([50, 40, 30, 20]))!.pendientePctPorHora).toBeLessThan(0);
  });

  it('devuelve null con menos muestras que el minimo', () => {
    expect(ajustarRecta(serie([10, 20]))).toBeNull();
    expect(serie([10, 20]).length).toBeLessThan(MIN_MUESTRAS);
  });

  it('devuelve null si todas las lecturas comparten el mismo instante', () => {
    const muestras = serie([10, 20, 30], 0);

    expect(ajustarRecta(muestras)).toBeNull();
  });

  it('reporta confianza 0 ante una serie plana, no 1', () => {
    // El ajuste es perfecto, pero una recta plana no predice ninguna saturacion.
    const ajuste = ajustarRecta(serie([40, 40, 40, 40]));

    expect(ajuste?.pendientePctPorHora).toBeCloseTo(0, 10);
    expect(ajuste?.r2).toBe(0);
  });

  it('mantiene r2 dentro de [0, 1]', () => {
    const ajuste = ajustarRecta(serie([5, 90, 12, 78, 3, 65]));

    expect(ajuste!.r2).toBeGreaterThanOrEqual(0);
    expect(ajuste!.r2).toBeLessThanOrEqual(1);
  });

  it('informa cuantas muestras uso', () => {
    expect(ajustarRecta(serie([10, 20, 30, 40, 50]))?.muestrasUsadas).toBe(5);
  });
});

describe('recortarAlCicloActual', () => {
  it('descarta todo lo anterior al ultimo vaciado', () => {
    const muestras = serie([70, 85, 5, 12, 20]);

    const ciclo = recortarAlCicloActual(muestras);

    expect(ciclo.map((m) => m.nivelLlenadoPct)).toEqual([5, 12, 20]);
  });

  it('se queda con el ultimo ciclo cuando hubo varios vaciados', () => {
    const muestras = serie([60, 80, 3, 40, 75, 8, 15]);

    expect(recortarAlCicloActual(muestras).map((m) => m.nivelLlenadoPct)).toEqual([8, 15]);
  });

  it('no recorta si el contenedor solo se lleno', () => {
    const muestras = serie([10, 20, 30, 40]);

    expect(recortarAlCicloActual(muestras)).toHaveLength(4);
  });

  it('tolera bajadas chicas sin confundirlas con un vaciado', () => {
    // Ruido de sensor: baja unos puntos y sigue subiendo.
    const muestras = serie([30, 28, 35, 41]);

    expect(recortarAlCicloActual(muestras)).toHaveLength(4);
    expect(CAIDA_QUE_INDICA_VACIADO_PCT).toBeGreaterThan(2);
  });

  it('sin el recorte, una serie con vaciado da una pendiente que no describe nada', () => {
    const conVaciado = serie([70, 85, 5, 12, 20]);

    const sinRecortar = ajustarRecta(conVaciado)!;
    const recortada = ajustarRecta(recortarAlCicloActual(conVaciado))!;

    // La serie completa "baja" por el vaciado del medio; el ciclo real sube.
    expect(sinRecortar.pendientePctPorHora).toBeLessThan(0);
    expect(recortada.pendientePctPorHora).toBeGreaterThan(0);
  });
});

describe('horasHastaUmbral', () => {
  it('calcula cuanto falta a la tasa ajustada', () => {
    expect(horasHastaUmbral(62.3, 70, 3.1)).toBeCloseTo(2.48, 2);
  });

  it('devuelve 0 si ya esta exactamente en el umbral', () => {
    expect(horasHastaUmbral(70, 70, 3)).toBe(0);
  });

  it('devuelve 0 si ya lo supero', () => {
    expect(horasHastaUmbral(94, 70, 3)).toBe(0);
  });

  it('devuelve null si el contenedor no se esta llenando', () => {
    // Un contenedor que se vacia no va a saturarse nunca: prometer una fecha
    // seria inventar un futuro.
    expect(horasHastaUmbral(30, 70, -2)).toBeNull();
    expect(horasHastaUmbral(30, 70, 0)).toBeNull();
  });

  it('da mas horas cuanto mas lento se llena', () => {
    const lento = horasHastaUmbral(20, 70, 1)!;
    const rapido = horasHastaUmbral(20, 70, 10)!;

    expect(lento).toBeGreaterThan(rapido);
  });
});
