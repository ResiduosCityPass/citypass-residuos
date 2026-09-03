import { generarApiKey, hashearApiKey } from './api-key';

describe('api-key', () => {
  it('genera claves de 64 caracteres hexadecimales', () => {
    expect(generarApiKey()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('genera una clave distinta cada vez', () => {
    expect(generarApiKey()).not.toBe(generarApiKey());
  });

  it('hashea de forma determinista, para poder verificar en cada lectura', () => {
    expect(hashearApiKey('abc')).toBe(hashearApiKey('abc'));
  });

  it('nunca devuelve la clave en claro dentro del hash', () => {
    const key = generarApiKey();

    expect(hashearApiKey(key)).not.toContain(key);
  });
});
