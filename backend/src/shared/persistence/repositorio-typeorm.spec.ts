import { EntityManager, Repository } from 'typeorm';
import { ContextoTransaccional } from './contexto-transaccional';
import { RepositorioTypeorm } from './repositorio-typeorm';

class Entidad {}

/** Subclase minima para poder observar que devuelve `repo()`. */
class RepositorioDePrueba extends RepositorioTypeorm<Entidad> {
  constructor(porDefecto: Repository<Entidad>, contexto: ContextoTransaccional) {
    super(porDefecto, contexto, Entidad);
  }

  expuesto(): Repository<Entidad> {
    return this.repo();
  }
}

describe('RepositorioTypeorm', () => {
  const porDefecto = { marca: 'por-defecto' } as unknown as Repository<Entidad>;
  const deLaTransaccion = { marca: 'transaccion' } as unknown as Repository<Entidad>;

  const contextoCon = (manager: EntityManager | null) =>
    ({ managerActual: () => manager }) as unknown as ContextoTransaccional;

  it('usa el repositorio por defecto fuera de una transaccion', () => {
    const repositorio = new RepositorioDePrueba(porDefecto, contextoCon(null));

    expect(repositorio.expuesto()).toBe(porDefecto);
  });

  it('usa el repositorio de la transaccion cuando hay una abierta', () => {
    const manager = {
      getRepository: jest.fn().mockReturnValue(deLaTransaccion),
    } as unknown as EntityManager;

    const repositorio = new RepositorioDePrueba(porDefecto, contextoCon(manager));

    expect(repositorio.expuesto()).toBe(deLaTransaccion);
    expect(manager.getRepository).toHaveBeenCalledWith(Entidad);
  });

  it('resuelve el repositorio en cada llamada, no una sola vez al construirse', () => {
    // Es lo que permite que el mismo adaptador sirva dentro y fuera de una
    // transaccion: si se cacheara, el primer uso decidiria para siempre.
    let manager: EntityManager | null = null;
    const contexto = { managerActual: () => manager } as unknown as ContextoTransaccional;
    const repositorio = new RepositorioDePrueba(porDefecto, contexto);

    expect(repositorio.expuesto()).toBe(porDefecto);

    manager = {
      getRepository: () => deLaTransaccion,
    } as unknown as EntityManager;

    expect(repositorio.expuesto()).toBe(deLaTransaccion);
  });
});
