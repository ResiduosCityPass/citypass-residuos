import {
  ESCENARIOS,
  ESTIMADORES,
  Escenario,
  azarConSemilla,
  evaluar,
  generarCiclo,
  generarCiclos,
} from './evaluacion';

const constante: Escenario = {
  nombre: 'constante',
  descripcion: 'Sube 2 puntos por lectura, sin error',
  incremento: () => 2,
  ruidoLectura: () => 0,
};

const escenario = (nombre: string) => ESCENARIOS.find((e) => e.nombre === nombre)!;

describe('evaluacion de la prediccion (CU-12)', () => {
  it('la misma semilla genera los mismos datos', () => {
    const a = azarConSemilla(42);
    const b = azarConSemilla(42);

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('interpola el cruce real entre las dos lecturas que lo rodean', () => {
    const ciclo = generarCiclo(constante, Math.random, 0, 5, new Date('2026-11-01T00:00:00Z'));

    // 0 -> 2 -> 4 -> 6: cruza 5 a mitad del tercer intervalo de 15 minutos.
    expect(ciclo.lecturas.map((l) => l.nivelLlenadoPct)).toEqual([0, 2, 4]);
    expect(ciclo.cruceEn.toISOString()).toBe('2026-11-01T00:37:30.000Z');
  });

  it('con un llenado perfectamente lineal, la regresion no se equivoca', () => {
    const ciclos = [generarCiclo(constante, Math.random, 10, 70, new Date('2026-11-01T00:00:00Z'))];

    const errores = evaluar(ciclos, 70, ESTIMADORES.regresion);

    expect(errores.cobertura).toBe(1);
    expect(errores.mae).toBeCloseTo(0, 9);
  });

  it('solo predice desde la cantidad minima de lecturas', () => {
    const ciclos = [generarCiclo(constante, Math.random, 0, 9, new Date('2026-11-01T00:00:00Z'))];

    // 5 lecturas (0, 2, 4, 6, 8): cortes con 3, 4 y 5 lecturas.
    expect(evaluar(ciclos, 9, ESTIMADORES.regresion).cortes).toBe(3);
  });

  it.each(ESCENARIOS.map((e) => e.nombre))(
    'en el escenario %s, la regresion se equivoca menos que el ultimo tramo',
    (nombre) => {
      const ciclos = generarCiclos(escenario(nombre), 50, 70, 2026);

      expect(evaluar(ciclos, 70, ESTIMADORES.regresion).mae).toBeLessThan(
        evaluar(ciclos, 70, ESTIMADORES['ultimo-tramo']).mae,
      );
    },
  );

  it('el MAE de las ultimas 6 h solo cuenta los cortes cercanos al cruce', () => {
    const ciclos = [generarCiclo(constante, Math.random, 0, 70, new Date('2026-11-01T00:00:00Z'))];

    // Lineal y sin error: tambien en el horizonte operativo el error es cero.
    expect(evaluar(ciclos, 70, ESTIMADORES.regresion).maeUltimas6h).toBeCloseTo(0, 9);
  });
});
