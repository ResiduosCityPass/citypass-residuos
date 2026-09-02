import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EstadoContenedor } from '../../../shared/domain/enums';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import {
  BusquedaCercanos,
  ContenedorCercano,
  ContenedorCercanoRepository,
} from '../domain/contenedor-cercano.repository';

/**
 * Formula de Haversine en SQL plano, sin PostGIS (ADR-002).
 *
 * El `least`/`greatest` acota el argumento del arcocoseno a [-1, 1]: en punto
 * flotante, el coseno de la distancia de un punto a si mismo puede dar 1.0000001
 * y `acos` devolveria NaN. Pasa exactamente cuando alguien busca parado encima
 * de un contenedor, que es el caso mas probable de todos.
 */
const RADIO_TIERRA_METROS = 6_371_000;

const DISTANCIA_SQL = `
  ${RADIO_TIERRA_METROS} * acos(least(1, greatest(-1,
    cos(radians(:lat)) * cos(radians(contenedor.lat)) *
    cos(radians(contenedor.lng) - radians(:lng)) +
    sin(radians(:lat)) * sin(radians(contenedor.lat))
  )))
`;

@Injectable()
export class ContenedorCercanoTypeormRepository implements ContenedorCercanoRepository {
  constructor(
    @InjectRepository(Contenedor)
    private readonly repo: Repository<Contenedor>,
  ) {}

  async buscarCercanos(busqueda: BusquedaCercanos): Promise<ContenedorCercano[]> {
    const qb = this.repo
      .createQueryBuilder('contenedor')
      .select('contenedor.id', 'id')
      .addSelect('contenedor.codigo', 'codigo')
      .addSelect('contenedor.lat', 'lat')
      .addSelect('contenedor.lng', 'lng')
      .addSelect('contenedor.tipoResiduo', 'tipoResiduo')
      .addSelect(DISTANCIA_SQL, 'distanciaMetros')
      .where('contenedor.activo = true')
      // Mandar a alguien caminando hasta un contenedor roto es peor que no
      // listarlo. Filtrar POR el estado no es lo mismo que exponerlo.
      .andWhere('contenedor.estado != :fueraDeServicio')
      .andWhere(`${DISTANCIA_SQL} <= :radioMetros`)
      .orderBy('"distanciaMetros"', 'ASC')
      .setParameters({
        lat: busqueda.lat,
        lng: busqueda.lng,
        radioMetros: busqueda.radioMetros,
        fueraDeServicio: EstadoContenedor.FUERA_DE_SERVICIO,
      });

    if (busqueda.tipoResiduo) {
      qb.andWhere('contenedor.tipoResiduo = :tipoResiduo', {
        tipoResiduo: busqueda.tipoResiduo,
      });
    }

    const filas = await qb.getRawMany<{
      id: string;
      codigo: string;
      lat: string;
      lng: string;
      tipoResiduo: ContenedorCercano['tipoResiduo'];
      distanciaMetros: string;
    }>();

    // getRawMany saltea los transformers de la entidad: las columnas numeric
    // llegan como string.
    return filas.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      lat: Number(f.lat),
      lng: Number(f.lng),
      tipoResiduo: f.tipoResiduo,
      distanciaMetros: Math.round(Number(f.distanciaMetros)),
    }));
  }
}
