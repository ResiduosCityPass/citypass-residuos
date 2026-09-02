import { EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { ContextoTransaccional } from './contexto-transaccional';

/**
 * Base de los adaptadores TypeORM que tienen que poder participar de una
 * transaccion en curso.
 *
 * `repo()` devuelve el repositorio atado al manager de la transaccion si hay
 * una abierta, y el repositorio por defecto si no. Los adaptadores usan siempre
 * `this.repo()` en lugar del repositorio inyectado, y asi el mismo codigo sirve
 * dentro y fuera de una transaccion.
 */
export abstract class RepositorioTypeorm<T extends ObjectLiteral> {
  protected constructor(
    private readonly repositorioPorDefecto: Repository<T>,
    private readonly contexto: ContextoTransaccional,
    private readonly entidad: EntityTarget<T>,
  ) {}

  protected repo(): Repository<T> {
    const manager = this.contexto.managerActual();

    return manager ? manager.getRepository(this.entidad) : this.repositorioPorDefecto;
  }
}
