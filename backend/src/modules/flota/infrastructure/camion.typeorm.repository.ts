import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Camion } from '../domain/camion.entity';
import { CamionRepository, FiltroCamiones } from '../domain/camion.repository';

@Injectable()
export class CamionTypeormRepository
  extends RepositorioTypeorm<Camion>
  implements CamionRepository
{
  constructor(
    @InjectRepository(Camion)
    repositorio: Repository<Camion>,
    contexto: ContextoTransaccional,
  ) {
    super(repositorio, contexto, Camion);
  }

  crear(camion: Partial<Camion>): Promise<Camion> {
    return this.repo().save(this.repo().create(camion));
  }

  guardar(camion: Camion): Promise<Camion> {
    return this.repo().save(camion);
  }

  buscarPorId(id: string): Promise<Camion | null> {
    return this.repo().findOne({ where: { id } });
  }

  buscarPorPatente(patente: string): Promise<Camion | null> {
    return this.repo().findOne({ where: { patente } });
  }

  listar(filtro: FiltroCamiones): Promise<Camion[]> {
    const where: FindOptionsWhere<Camion> = {};

    if (filtro.estado) where.estado = filtro.estado;
    if (filtro.tipoResiduoHabilitado) where.tipoResiduoHabilitado = filtro.tipoResiduoHabilitado;

    return this.repo().find({ where, order: { patente: 'ASC' } });
  }
}
