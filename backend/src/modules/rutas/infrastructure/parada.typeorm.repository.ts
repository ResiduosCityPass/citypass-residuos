import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import { Parada } from '../domain/parada.entity';
import { ParadaRepository } from '../domain/parada.repository';

@Injectable()
export class ParadaTypeormRepository
  extends RepositorioTypeorm<Parada>
  implements ParadaRepository
{
  constructor(
    @InjectRepository(Parada)
    repositorio: Repository<Parada>,
    contexto: ContextoTransaccional,
  ) {
    super(repositorio, contexto, Parada);
  }

  crearVarias(paradas: Partial<Parada>[]): Promise<Parada[]> {
    return this.repo().save(this.repo().create(paradas));
  }

  guardar(parada: Parada): Promise<Parada> {
    return this.repo().save(parada);
  }

  buscarPorId(id: string): Promise<Parada | null> {
    return this.repo().findOne({
      where: { id },
      relations: { ruta: true, contenedor: true },
    });
  }

  listarDeRuta(rutaId: string): Promise<Parada[]> {
    return this.repo().find({ where: { rutaId }, order: { orden: 'ASC' } });
  }
}
