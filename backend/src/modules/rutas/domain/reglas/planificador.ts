import { Punto, distanciaKm } from '../../../../shared/domain/geo';

export interface CandidatoRuteo extends Punto {
  contenedorId: string;
  /** Litros que ocupa hoy este contenedor, segun su nivel de llenado. */
  litrosOcupados: number;
}

export interface PlanDeRuta {
  /** Contenedores en el orden en que hay que visitarlos. */
  paradas: CandidatoRuteo[];
  distanciaKm: number;
  litros: number;
}

/**
 * CU-08 · Heuristica de ruteo.
 *
 * Sale del deposito y en cada paso toma el contenedor mas cercano que todavia
 * entre en el camion. Cuando ninguno entra, vuelve al deposito.
 *
 * **Es vecino mas cercano, no optimizacion exacta.** El problema completo es un
 * Vehicle Routing Problem con capacidad, que es NP-hard. El recorte esta
 * justificado en el ADR-004: la version greedy es explicable, determinista y
 * demuestra el caso de uso igual. Sustituirla por una optimizacion real
 * significa reemplazar esta funcion y nada mas.
 *
 * Como todas las reglas del modulo, no importa nada del framework.
 */
export function planificarRuta(
  deposito: Punto,
  candidatos: CandidatoRuteo[],
  capacidadLitros: number,
): PlanDeRuta {
  const pendientes = [...candidatos];
  const paradas: CandidatoRuteo[] = [];

  let posicion: Punto = deposito;
  let litros = 0;
  let distancia = 0;

  while (pendientes.length > 0) {
    const alcanzables = pendientes.filter((c) => litros + c.litrosOcupados <= capacidadLitros);

    if (alcanzables.length === 0) {
      break;
    }

    const masCercano = alcanzables.reduce((mejor, c) =>
      distanciaKm(posicion, c) < distanciaKm(posicion, mejor) ? c : mejor,
    );

    distancia += distanciaKm(posicion, masCercano);
    litros += masCercano.litrosOcupados;
    posicion = masCercano;
    paradas.push(masCercano);
    pendientes.splice(
      pendientes.findIndex((c) => c.contenedorId === masCercano.contenedorId),
      1,
    );
  }

  // La vuelta al deposito es parte del recorrido: sin contarla, dos propuestas
  // con la misma distancia de ida pueden costar muy distinto.
  distancia += distanciaKm(posicion, deposito);

  return {
    paradas,
    distanciaKm: Number(distancia.toFixed(1)),
    litros: Math.round(litros),
  };
}

/** Litros que ocupa hoy un contenedor, segun su nivel de llenado. */
export function litrosOcupados(capacidadLitros: number, nivelLlenadoPct: number): number {
  return (capacidadLitros * nivelLlenadoPct) / 100;
}
