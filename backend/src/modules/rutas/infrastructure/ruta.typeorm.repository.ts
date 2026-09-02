import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import { EstadoRuta } from '../../../shared/domain/enums';
import { Parada } from '../domain/parada.entity';
import { ESTADOS_VIVOS, FiltroRutas, RutaRepository } from '../domain/ruta.repository';
import { Ruta } from '../domain/ruta.entity';

const RELACIONES_COMPLETAS = {
  camion: true,
  paradas: { contenedor: true },
} as const;

@Injectable()
export class RutaTypeormRepository extends RepositorioTypeorm<Ruta> implements RutaRepository {
  constructor(
    @InjectRepository(Ruta)
    repositorio: Repository<Ruta>,
    @InjectRepository(Parada)
    private readonly paradas: Repository<Parada>,
    contexto: ContextoTransaccional,
  ) {
    super(repositorio, contexto, Ruta);
  }

  crear(ruta: Partial<Ruta>): Promise<Ruta> {
    return this.repo().save(this.repo().create(ruta));
  }

  guardar(ruta: Ruta): Promise<Ruta> {
    return this.repo().save(ruta);
  }

  async buscarPorId(id: string): Promise<Ruta | null> {
    const ruta = await this.repo().findOne({ where: { id }, relations: RELACIONES_COMPLETAS });

    return ruta ? this.ordenarParadas(ruta) : null;
  }

  listar(filtro: FiltroRutas): Promise<Ruta[]> {
    const where: FindOptionsWhere<Ruta> = {};

    if (filtro.estado) where.estado = filtro.estado;
    if (filtro.camionId) where.camionId = filtro.camionId;

    return this.repo().find({
      where,
      relations: { camion: true },
      order: { generadaEn: 'DESC' },
    });
  }

  async buscarActivaDeChofer(choferId: string): Promise<Ruta | null> {
    const ruta = await this.repo().findOne({
      where: {
        choferId,
        estado: In([EstadoRuta.ASIGNADA, EstadoRuta.EN_CURSO]),
      },
      relations: RELACIONES_COMPLETAS,
      order: { asignadaEn: 'DESC' },
    });

    return ruta ? this.ordenarParadas(ruta) : null;
  }

  async contenedoresEnRutasVivas(): Promise<string[]> {
    const filas = await this.paradas
      .createQueryBuilder('parada')
      .select('parada.contenedorId', 'contenedorId')
      .innerJoin('parada.ruta', 'ruta')
      .where('ruta.estado IN (:...estados)', { estados: ESTADOS_VIVOS })
      .getRawMany<{ contenedorId: string }>();

    return filas.map((f) => f.contenedorId);
  }

  /**
   * TypeORM no garantiza el orden de una relacion OneToMany, y el orden de las
   * paradas ES el recorrido: mostrarlas desordenadas seria mostrar otra ruta.
   */
  private ordenarParadas(ruta: Ruta): Ruta {
    ruta.paradas?.sort((a, b) => a.orden - b.orden);

    return ruta;
  }
}
