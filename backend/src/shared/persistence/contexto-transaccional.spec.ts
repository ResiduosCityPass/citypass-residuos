import { DataSource, EntityManager } from 'typeorm';
import { ContextoTransaccional } from './contexto-transaccional';

describe('ContextoTransaccional', () => {
  const managerFalso = { id: 'manager' } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn((bloque: (m: EntityManager) => Promise<unknown>) => bloque(managerFalso)),
  } as unknown as DataSource;

  let contexto: ContextoTransaccional;

  beforeEach(() => {
    jest.clearAllMocks();
    contexto = new ContextoTransaccional(dataSource);
  });

  it('no hay manager fuera de una transaccion', () => {
    expect(contexto.managerActual()).toBeNull();
  });

  it('expone el manager adentro del bloque', async () => {
    await contexto.ejecutar(async () => {
      expect(contexto.managerActual()).toBe(managerFalso);
    });
  });

  it('el manager sobrevive a los await del bloque', async () => {
    // Es lo que hace util a AsyncLocalStorage: el contexto viaja por toda la
    // cadena asincronica, no solo por el primer tick.
    await contexto.ejecutar(async () => {
      await new Promise((resolver) => setTimeout(resolver, 5));
      await Promise.resolve();

      expect(contexto.managerActual()).toBe(managerFalso);
    });
  });

  it('el contexto se limpia al salir', async () => {
    await contexto.ejecutar(async () => undefined);

    expect(contexto.managerActual()).toBeNull();
  });

  it('devuelve lo que devuelve el bloque', async () => {
    await expect(contexto.ejecutar(async () => 42)).resolves.toBe(42);
  });

  it('propaga el error para que la transaccion revierta', async () => {
    await expect(
      contexto.ejecutar(async () => {
        throw new Error('fallo de negocio');
      }),
    ).rejects.toThrow('fallo de negocio');
  });

  it('el contexto queda limpio aunque el bloque falle', async () => {
    await expect(contexto.ejecutar(async () => Promise.reject(new Error('x')))).rejects.toThrow();

    expect(contexto.managerActual()).toBeNull();
  });
});
