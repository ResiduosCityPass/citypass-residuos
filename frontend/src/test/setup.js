import '@testing-library/jest-dom/vitest';

/**
 * Node 26 trae su propio `localStorage` global experimental que devuelve undefined
 * si no se arranca con --localstorage-file, y le gana al que provee jsdom. Como el
 * cliente de la API guarda el token ahi, en los tests lo reemplazamos por uno en
 * memoria. En el navegador esto no corre: ahi el storage real funciona.
 *
 * `sessionStorage` va por el mismo camino: es donde vive la credencial que pega
 * el chofer.
 */
function storageEnMemoria(nombre) {
  if (globalThis[nombre]) return;

  const memoria = new Map();
  Object.defineProperty(globalThis, nombre, {
    configurable: true,
    value: {
      getItem: (clave) => (memoria.has(clave) ? memoria.get(clave) : null),
      setItem: (clave, valor) => memoria.set(clave, String(valor)),
      removeItem: (clave) => memoria.delete(clave),
      clear: () => memoria.clear(),
    },
  });
}

storageEnMemoria('localStorage');
storageEnMemoria('sessionStorage');
