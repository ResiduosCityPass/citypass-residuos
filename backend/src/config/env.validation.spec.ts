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
    expect(config.DB_SSL).toBe('false');
    expect(config.JWT_ISSUER_CHOFERES).toBe('citypass-residuos-choferes');
  });

  it('falla al arrancar si falta una variable obligatoria', () => {
    const { JWT_SECRET: _omitida, ...incompleto } = entornoValido;

    expect(() => validarEntorno(incompleto)).toThrow(/JWT_SECRET/);
  });

  it('acepta DATABASE_URL en lugar de variables separadas de base', () => {
    const config = validarEntorno({
      DATABASE_URL: 'postgresql://citypass:citypass@localhost:5432/residuos',
      JWT_SECRET: 'dev-secret',
    });

    expect(config.DATABASE_URL).toBe('postgresql://citypass:citypass@localhost:5432/residuos');
  });

  it('falla si faltan datos de base y no hay DATABASE_URL', () => {
    const { DB_HOST: _omitida, ...incompleto } = entornoValido;

    expect(() => validarEntorno(incompleto)).toThrow(/DB_HOST/);
  });

  it('rechaza un puerto fuera de rango', () => {
    expect(() => validarEntorno({ ...entornoValido, PORT: '99999' })).toThrow(/PORT/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => validarEntorno({ ...entornoValido, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('exige issuer, audiencia y JWKS confirmados para el modo federado', () => {
    expect(() => validarEntorno({ ...entornoValido, AUTH_MODE: 'federated' })).toThrow(
      'JWT_ISSUER',
    );
    const config = {
      ...entornoValido,
      AUTH_MODE: 'federated',
      JWT_ISSUER: 'idp-confirmado',
      JWT_AUDIENCE: 'api-confirmada',
    };
    expect(() => validarEntorno(config)).toThrow('JWT_JWKS_URL');
    expect(() => validarEntorno({ ...config, JWT_JWKS_URL: 'http://idp/jwks' })).toThrow('HTTPS');
    expect(validarEntorno({ ...config, JWT_JWKS_URL: 'https://idp/jwks' }).AUTH_MODE).toBe(
      'federated',
    );
  });

  it('no permite un mismo grupo para dos roles', () => {
    expect(() =>
      validarEntorno({
        ...entornoValido,
        JWT_ADMIN_GROUPS: 'delegados',
        JWT_OPERATOR_GROUPS: 'delegados',
      }),
    ).toThrow('mas de un rol');
  });
  it('exige credenciales propias, namespace y TLS para habilitar EDA', () => {
    expect(() => validarEntorno({ ...entornoValido, EVENT_BUS_DRIVER: 'platform' })).toThrow(
      'GATEWAY_CLIENT_ID',
    );
    const base = {
      ...entornoValido,
      EVENT_BUS_DRIVER: 'platform',
      GATEWAY_CLIENT_SECRET: 'test',
      GATEWAY_CLIENT_ID: 'grupo6',
      GATEWAY_URL: 'https://gateway.example',
      GATEWAY_TOKEN_URL: 'https://auth.example/oauth/token',
      KAFKA_BROKERS: 'bus:9092',
    };
    expect(validarEntorno(base).KAFKA_SSL).toBe('true');
    expect(() => validarEntorno({ ...base, GATEWAY_NAMESPACE: 'com.citypass.turismo' })).toThrow(
      'GATEWAY_NAMESPACE',
    );
    expect(() => validarEntorno({ ...base, KAFKA_GROUP_ID: 'otro-grupo' })).toThrow('GROUP_ID');
    expect(validarEntorno({ ...base, KAFKA_BROKERS: '' }).KAFKA_BROKERS).toBe('');
    expect(() => validarEntorno({ ...base, NODE_ENV: 'production', KAFKA_SSL: 'false' })).toThrow(
      'TLS',
    );
    expect(() => validarEntorno({ ...base, GATEWAY_TOKEN_URL: 'http://otro-idp' })).toThrow(
      'HTTPS',
    );
    expect(validarEntorno({ ...base, GATEWAY_URL: 'http://localhost:8080' }).GATEWAY_URL).toContain(
      'localhost',
    );
  });
  it('no permite habilitar los tipos de simulacro EDA en produccion', () => {
    expect(validarEntorno(entornoValido).CLIMA_SIMULACRO_EDA_HABILITADO).toBe('false');
    expect(() =>
      validarEntorno({
        ...entornoValido,
        NODE_ENV: 'production',
        CLIMA_SIMULACRO_EDA_HABILITADO: 'true',
      }),
    ).toThrow('simulacros');
    expect(() =>
      validarEntorno({ ...entornoValido, CLIMA_SIMULACRO_EDA_HABILITADO: 'quizas' }),
    ).toThrow('CLIMA_SIMULACRO_EDA_HABILITADO');
  });
});
