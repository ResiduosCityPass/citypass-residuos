import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * `waste.js` es la unica superficie de datos de la app: elige entre el mock
 * en memoria y la API real segun `VITE_USE_MOCKS` y reexporta cada funcion
 * con el mismo nombre. Esa tabla de reexports no la ejercita nadie mas: cada
 * pantalla mockea `api/waste.js` entero en sus tests (`vi.mock('../api/waste.js', ...)`),
 * asi que un nombre que quede desalineado entre este archivo y su fuente
 * (`waste.http.js` o `mocks/server.js`) recien explota en runtime, la primera
 * vez que alguien llama a esa funcion en el ambiente equivocado.
 *
 * Este test no fija la lista de funciones a mano: la lee de `waste.http.js`
 * (la fuente real, sin mockear) y verifica, para cada una, que `waste.js`
 * delegue en la fuente correcta con los mismos argumentos y devuelva su
 * resultado. Si mañana se agrega una funcion nueva y se tipea mal el nombre
 * en uno de los dos lados, este test la atrapa sin que haga falta tocarlo.
 */
describe('waste.js — selector de fuente (mock vs. backend real)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('./waste.http.js');
    vi.doUnmock('../mocks/server.js');
    vi.resetModules();
  });

  /** Envuelve cada export de un modulo real en un spy que no ejecuta la logica original. */
  async function espiarModulo(ruta) {
    const real = await vi.importActual(ruta);
    const nombres = Object.keys(real);
    const espiado = Object.fromEntries(
      nombres.map((nombre) => [nombre, vi.fn(() => `resultado:${nombre}`)]),
    );
    vi.doMock(ruta, () => espiado);
    return { nombres, espiado };
  }

  async function montar(usarMocks) {
    vi.stubEnv('VITE_USE_MOCKS', usarMocks ? 'true' : 'false');

    const { nombres, espiado: http } = await espiarModulo('./waste.http.js');
    const { espiado: mock } = await espiarModulo('../mocks/server.js');

    const waste = await import('./waste.js');
    const funciones = nombres.filter((n) => n !== 'default');

    return { waste, http, mock, funciones };
  }

  it('USING_MOCKS queda en false cuando VITE_USE_MOCKS no es la cadena "true"', async () => {
    const { waste } = await montar(false);
    expect(waste.USING_MOCKS).toBe(false);
  });

  it('USING_MOCKS queda en true solo con VITE_USE_MOCKS="true"', async () => {
    const { waste } = await montar(true);
    expect(waste.USING_MOCKS).toBe(true);
  });

  it('con VITE_USE_MOCKS=false, cada funcion reexportada delega en waste.http.js', async () => {
    const { waste, http, mock, funciones } = await montar(false);

    for (const nombre of funciones) {
      expect(typeof waste[nombre]).toBe('function');

      const resultado = await waste[nombre]('arg-1', 'arg-2');

      expect(http[nombre]).toHaveBeenCalledWith('arg-1', 'arg-2');
      expect(mock[nombre]).not.toHaveBeenCalled();
      expect(resultado).toBe(`resultado:${nombre}`);
    }
  });

  it('con VITE_USE_MOCKS=true, cada funcion reexportada delega en mocks/server.js', async () => {
    const { waste, http, mock, funciones } = await montar(true);

    for (const nombre of funciones) {
      const resultado = await waste[nombre]('arg-1', 'arg-2');

      expect(mock[nombre]).toHaveBeenCalledWith('arg-1', 'arg-2');
      expect(http[nombre]).not.toHaveBeenCalled();
      expect(resultado).toBe(`resultado:${nombre}`);
    }
  });
});
