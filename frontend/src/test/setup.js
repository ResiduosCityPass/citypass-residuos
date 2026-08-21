import '@testing-library/jest-dom/vitest';

/**
 * Node 26 trae su propio `localStorage` global experimental que devuelve undefined
 * si no se arranca con --localstorage-file, y le gana al que provee jsdom. Como el
 * cliente de la API guarda el token ahi, en los tests lo reemplazamos por uno en
 * memoria. En el navegador esto no corre: ahi el localStorage real funciona.
 */
if (!globalThis.localStorage) {
  const memoria = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (clave) => (memoria.has(clave) ? memoria.get(clave) : null),
      setItem: (clave, valor) => memoria.set(clave, String(valor)),
      removeItem: (clave) => memoria.delete(clave),
      clear: () => memoria.clear(),
    },
  });
}
