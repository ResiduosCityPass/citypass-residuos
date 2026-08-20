import { validarEntorno } from './env.validation';

describe('validarEntorno', () => {
  const entornoValido = {
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USER: 'citypass',
    DB_PASSWORD: 'citypass',
    DB_NAME: 'residuos',
    JWT_SECRET: 'dev-secret',
  };

  it('acepta una configuracion completa y convierte los tipos', () => {
    const config = validarEntorno(entornoValido);

    expect(config.DB_PORT).toBe(5432);
    expect(config.PORT).toBe(3000);
    expect(config.EVENT_BUS_DRIVER).toBe('inmemory');
  });

  it('falla al arrancar si falta una variable obligatoria', () => {
    const { JWT_SECRET: _omitida, ...incompleto } = entornoValido;

    expect(() => validarEntorno(incompleto)).toThrow(/JWT_SECRET/);
  });

  it('rechaza un puerto fuera de rango', () => {
    expect(() => validarEntorno({ ...entornoValido, PORT: '99999' })).toThrow(/PORT/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => validarEntorno({ ...entornoValido, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
