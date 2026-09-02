import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Permite que varios repositorios participen de una misma transaccion sin que
 * el EntityManager viaje como parametro por toda la capa de aplicacion.
 *
 * El problema que resuelve: la ingesta de una lectura escribe en cuatro tablas
 * —lectura, sensor, contenedor, alerta— mas la tabla outbox. Si eso no es
 * atomico, un fallo en el medio deja el contenedor marcado critico sin su
 * alerta, o la alerta sin el evento que la anuncia.
 *
 * La alternativa era agregar un parametro `manager` a cada metodo de cada
 * puerto de repositorio, lo que ensuciaria la capa de dominio con un tipo de
 * TypeORM. Con AsyncLocalStorage el manager viaja implicito por el contexto
 * asincronico y los puertos quedan limpios.
 */
@Injectable()
export class ContextoTransaccional {
  private readonly almacen = new AsyncLocalStorage<EntityManager>();

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Corre el bloque dentro de una transaccion. Todo repositorio que resuelva su
   * manager con `managerActual()` va a escribir en ella.
   */
  ejecutar<T>(bloque: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => this.almacen.run(manager, bloque));
  }

  /** El manager de la transaccion en curso, o null si no hay ninguna. */
  managerActual(): EntityManager | null {
    return this.almacen.getStore() ?? null;
  }
}
