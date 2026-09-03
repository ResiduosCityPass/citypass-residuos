import { CandidatoRuteo, litrosOcupados, planificarRuta } from './planificador';

const DEPOSITO = { lat: -34.6037, lng: -58.3816 };

/** Contenedor a `gradosAlSur` del deposito, con los litros indicados. */
const candidato = (id: string, gradosAlSur: number, litros = 100): CandidatoRuteo => ({
  contenedorId: id,
  lat: DEPOSITO.lat - gradosAlSur,
  lng: DEPOSITO.lng,
  litrosOcupados: litros,
});

describe('planificarRuta', () => {
  describe('orden de las paradas', () => {
    it('arranca por el mas cercano al deposito', () => {
      const plan = planificarRuta(
        DEPOSITO,
        [candidato('lejos', 0.05), candidato('cerca', 0.005), candidato('medio', 0.02)],
        10_000,
      );

      expect(plan.paradas[0].contenedorId).toBe('cerca');
    });

    it('encadena por cercania desde la ultima parada, no desde el deposito', () => {
      const plan = planificarRuta(
        DEPOSITO,
        [candidato('a', 0.01), candidato('b', 0.011), candidato('c', 0.05)],
        10_000,
      );

      // b esta a un paso de a, aunque desde el deposito a y c se parezcan mas.
      expect(plan.paradas.map((p) => p.contenedorId)).toEqual(['a', 'b', 'c']);
    });

    it('visita todos si la capacidad alcanza', () => {
      const plan = planificarRuta(
        DEPOSITO,
        [candidato('a', 0.01), candidato('b', 0.02), candidato('c', 0.03)],
        10_000,
      );

      expect(plan.paradas).toHaveLength(3);
    });

    it('es determinista: dos corridas con la misma entrada dan lo mismo', () => {
      const entrada = [candidato('a', 0.02), candidato('b', 0.01), candidato('c', 0.03)];

      const primera = planificarRuta(DEPOSITO, entrada, 10_000);
      const segunda = planificarRuta(DEPOSITO, entrada, 10_000);

      expect(primera).toEqual(segunda);
    });

    it('no modifica la lista que recibe', () => {
      const entrada = [candidato('a', 0.01), candidato('b', 0.02)];

      planificarRuta(DEPOSITO, entrada, 10_000);

      expect(entrada).toHaveLength(2);
    });
  });

  describe('capacidad del camion', () => {
    it('corta cuando no entra ninguno mas', () => {
      const plan = planificarRuta(
        DEPOSITO,
        [candidato('a', 0.01, 600), candidato('b', 0.02, 600), candidato('c', 0.03, 600)],
        1500,
      );

      expect(plan.paradas).toHaveLength(2);
      expect(plan.litros).toBe(1200);
    });

    it('nunca se pasa de la capacidad', () => {
      const plan = planificarRuta(
        DEPOSITO,
        [candidato('a', 0.01, 900), candidato('b', 0.02, 900)],
        1000,
      );

      expect(plan.litros).toBeLessThanOrEqual(1000);
      expect(plan.paradas).toHaveLength(1);
    });

    it('saltea el que no entra pero sigue con los que si', () => {
      // El grande queda afuera; los chicos que estan mas lejos igual se levantan.
      const plan = planificarRuta(
        DEPOSITO,
        [candidato('enorme', 0.005, 5000), candidato('chico', 0.02, 100)],
        1000,
      );

      expect(plan.paradas.map((p) => p.contenedorId)).toEqual(['chico']);
    });

    it('devuelve una ruta vacia si no entra ninguno', () => {
      const plan = planificarRuta(DEPOSITO, [candidato('a', 0.01, 9000)], 1000);

      expect(plan.paradas).toEqual([]);
      expect(plan.litros).toBe(0);
    });

    it('con la lista vacia devuelve distancia cero', () => {
      const plan = planificarRuta(DEPOSITO, [], 10_000);

      expect(plan.paradas).toEqual([]);
      expect(plan.distanciaKm).toBe(0);
    });
  });

  describe('distancia estimada', () => {
    it('incluye la vuelta al deposito', () => {
      const soloIda = planificarRuta(DEPOSITO, [candidato('a', 0.009)], 10_000);

      // Ida (~1 km) mas vuelta (~1 km).
      expect(soloIda.distanciaKm).toBeGreaterThan(1.8);
      expect(soloIda.distanciaKm).toBeLessThan(2.2);
    });

    it('crece al agregar paradas mas lejanas', () => {
      const corta = planificarRuta(DEPOSITO, [candidato('a', 0.005)], 10_000);
      const larga = planificarRuta(DEPOSITO, [candidato('a', 0.005), candidato('b', 0.05)], 10_000);

      expect(larga.distanciaKm).toBeGreaterThan(corta.distanciaKm);
    });
  });
});

describe('litrosOcupados', () => {
  it('calcula sobre el nivel de llenado', () => {
    expect(litrosOcupados(1100, 50)).toBe(550);
  });

  it('un contenedor vacio no ocupa nada', () => {
    expect(litrosOcupados(1100, 0)).toBe(0);
  });

  it('un contenedor lleno ocupa su capacidad', () => {
    expect(litrosOcupados(1100, 100)).toBe(1100);
  });
});
