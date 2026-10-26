import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { Intervencion } from '../domain/intervencion.entity';
import { IntervencionRepository } from '../domain/intervencion.repository';

@Injectable()
export class IntervencionTypeormRepository implements IntervencionRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contexto: ContextoTransaccional,
  ) {}

  private manager(): EntityManager {
    return this.contexto.managerActual() ?? this.dataSource.manager;
  }

  async crearSiNoExiste(datos: Partial<Intervencion>): Promise<Intervencion | null> {
    const repo = this.manager().getRepository(Intervencion);

    // ON CONFLICT DO NOTHING contra el indice unico de emergenciaId: si otro
    // evento ya la programo, no inserta y tampoco rompe la transaccion.
    const resultado = await repo
      .createQueryBuilder()
      .insert()
      .values(datos)
      .orIgnore()
      .returning('*')
      .execute();

    if (resultado.raw.length === 0) {
      return null;
    }

    return repo.findOneByOrFail({ emergenciaId: datos.emergenciaId });
  }

  listar(): Promise<Intervencion[]> {
    return this.manager()
      .getRepository(Intervencion)
      .find({ order: { programadaEn: 'DESC' } });
  }

  buscar(id: string): Promise<Intervencion | null> {
    return this.manager().getRepository(Intervencion).findOneBy({ id });
  }
}
