import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { LECTURA_REPOSITORY, LecturaRepository } from '../../lecturas/domain/lectura.repository';
import { ZonasService } from '../../zonas/application/zonas.service';
import {
  Muestra,
  ajustarRecta,
  horasHastaUmbral,
  recortarAlCicloActual,
} from '../domain/reglas/regresion-lineal';

export interface Prediccion {
  contenedorId: string;
  codigo: string;
  nivelActualPct: number;
  umbralCriticoPct: number;
  tasaLlenadoPctPorHora: number;
  horasHastaUmbral: number;
  saturacionEstimadaEn: string;
  confianza: number;
  muestrasUsadas: number;
}

/** Cuantas lecturas se traen como maximo para ajustar la recta. */
const MAX_LECTURAS_DEFAULT = 200;

const redondear = (valor: number, decimales: number): number => Number(valor.toFixed(decimales));

/**
 * CU-12 · Predecir saturacion de contenedor.
 *
 * Caso de uso agregado por el squad (ADR-004): estima cuantas horas faltan para
 * que un contenedor cruce el umbral de su zona, para poder mandar el camion
 * antes de que se desborde en vez de despues.
 *
 * El servicio orquesta; la matematica vive en `domain/reglas/regresion-lineal.ts`,
 * sin dependencias del framework.
 */
@Injectable()
export class PrediccionService {
  private readonly maxLecturas: number;

  constructor(
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(LECTURA_REPOSITORY)
    private readonly lecturas: LecturaRepository,
    private readonly zonas: ZonasService,
    config: ConfigService,
  ) {
    this.maxLecturas = Number(config.get<number>('PREDICCION_MAX_LECTURAS', MAX_LECTURAS_DEFAULT));
  }

  async predecir(contenedorId: string): Promise<Prediccion> {
    const contenedor = await this.contenedores.buscarPorId(contenedorId);

    if (!contenedor) {
      throw new NotFoundException({
        message: `No existe el contenedor ${contenedorId}`,
        code: 'CONTENEDOR_NO_ENCONTRADO',
      });
    }

    const zona = await this.zonas.obtener(contenedor.zonaId);

    // El repositorio devuelve de la mas nueva a la mas vieja; la regresion
    // necesita el orden cronologico.
    const recientes = await this.lecturas.ultimasDe(contenedor.id, this.maxLecturas);
    const cronologicas: Muestra[] = [...recientes].reverse();

    // Solo el ciclo de llenado actual: una ventana que cruce un vaciado produce
    // una pendiente que no describe nada real.
    const ajuste = ajustarRecta(recortarAlCicloActual(cronologicas));

    if (!ajuste) {
      throw new ConflictException({
        message:
          `El contenedor ${contenedor.codigo} todavia no tiene lecturas suficientes ` +
          `para estimar su tasa de llenado.`,
        code: 'SIN_LECTURAS_SUFICIENTES',
      });
    }

    const horas = horasHastaUmbral(
      contenedor.nivelLlenadoPct,
      zona.umbralCriticoPct,
      ajuste.pendientePctPorHora,
    );

    if (horas === null) {
      throw new ConflictException({
        message:
          `El contenedor ${contenedor.codigo} no muestra una tendencia de llenado creciente, ` +
          `asi que no se puede estimar cuando va a saturarse.`,
        code: 'TENDENCIA_NO_CRECIENTE',
      });
    }

    return {
      contenedorId: contenedor.id,
      codigo: contenedor.codigo,
      nivelActualPct: contenedor.nivelLlenadoPct,
      umbralCriticoPct: zona.umbralCriticoPct,
      tasaLlenadoPctPorHora: redondear(ajuste.pendientePctPorHora, 2),
      horasHastaUmbral: redondear(horas, 2),
      saturacionEstimadaEn: new Date(Date.now() + horas * 3_600_000).toISOString(),
      confianza: redondear(ajuste.r2, 3),
      muestrasUsadas: ajuste.muestrasUsadas,
    };
  }
}
