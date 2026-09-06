import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import { Chofer } from '../domain/chofer.entity';
import { ChoferRepository, FiltroChoferes } from '../domain/chofer.repository';

@Injectable()
export class ChoferTypeormRepository
  extends RepositorioTypeorm<Chofer>
  implements ChoferRepository
{
  constructor(
    @InjectRepository(Chofer)
    repositorio: Repository<Chofer>,
    contexto: ContextoTransaccional,
  ) {
    super(repositorio, contexto, Chofer);
  }

  crear(chofer: Partial<Chofer>): Promise<Chofer> {
    return this.repo().save(this.repo().create(chofer));
  }

  guardar(chofer: Chofer): Promise<Chofer> {
    return this.repo().save(chofer);
  }

  buscarPorId(id: string): Promise<Chofer | null> {
    return this.repo().findOne({ where: { id } });
  }

  buscarPorLegajo(legajo: string): Promise<Chofer | null> {
    return this.repo().findOne({ where: { legajo } });
  }

  buscarActivoPorUsuarioSub(sub: string): Promise<Chofer | null> {
    return this.repo().findOne({ where: { usuarioSub: sub, activo: true } });
  }

  listar(filtro: FiltroChoferes): Promise<Chofer[]> {
    const where: FindOptionsWhere<Chofer> = {};

    if (filtro.soloActivos) where.activo = true;

    return this.repo().find({ where, order: { nombre: 'ASC' } });
  }
}
