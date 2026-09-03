import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import { Repository } from 'typeorm';
import { Lectura } from '../domain/lectura.entity';
import { LecturaRepository } from '../domain/lectura.repository';

@Injectable()
export class LecturaTypeormRepository
  extends RepositorioTypeorm<Lectura>
  implements LecturaRepository
{
  constructor(
    @InjectRepository(Lectura)
    repositorio: Repository<Lectura>,
    contexto: ContextoTransaccional,
  ) {
    super(repositorio, contexto, Lectura);
  }

  crear(lectura: Partial<Lectura>): Promise<Lectura> {
    return this.repo().save(this.repo().create(lectura));
  }

  /** Usa idx_lectura_contenedor_fecha. Es el acceso mas caliente del modulo. */
  ultimaDe(contenedorId: string): Promise<Lectura | null> {
    return this.repo().findOne({
      where: { contenedorId },
      order: { registradaEn: 'DESC' },
    });
  }

  ultimasDe(contenedorId: string, cantidad: number): Promise<Lectura[]> {
    return this.repo().find({
      where: { contenedorId },
      order: { registradaEn: 'DESC' },
      take: cantidad,
    });
  }
}
