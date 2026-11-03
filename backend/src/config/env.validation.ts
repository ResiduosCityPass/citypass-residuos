import { plainToInstance } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

/**
 * Emisor con el que se firman y se leen los tokens.
 *
 * Tiene un valor por defecto porque la aplicacion tiene que poder arrancar sin
 * un `.env`: el CI no tiene uno, y `jsonwebtoken` rechaza `issuer: undefined`
 * con "issuer must be a string" recien al firmar el primer token, no al
 * arrancar. En el Sprint 3 pasa a ser el emisor del Squad 2, por configuracion.
 */
export const EMISOR_TOKEN_DEFAULT = 'citypass-squad2';

/**
 * Emisor de la credencial del chofer (ADR-009).
 *
 * Distinto de `EMISOR_TOKEN_DEFAULT` a proposito: ese representa al Squad 2
 * (real en produccion, una mentira temporal y documentada en desarrollo). El
 * del chofer nunca es el Squad 2 -- el chofer no se registra ni inicia sesion
 * contra ellos -- asi que reusar el mismo emisor seria una mentira permanente,
 * no una de desarrollo. Ver ADR-009, seccion de acciones abiertas.
 */
export const EMISOR_CHOFERES_DEFAULT = 'citypass-residuos-choferes';

/** Esta API como destinatario del token. Viaja en `aud`, siempre como lista. */
export const AUDIENCIA_TOKEN_DEFAULT = 'citypass-residuos-api';

enum Entorno {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class VariablesEntorno {
  @IsEnum(Entorno)
  @IsOptional()
  NODE_ENV: Entorno = Entorno.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsOptional()
  DB_HOST?: string;

  @IsInt()
  @IsOptional()
  DB_PORT?: number;

  @IsString()
  @IsOptional()
  DB_USER?: string;

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string;

  @IsString()
  @IsOptional()
  DB_NAME?: string;

  @IsString()
  @IsOptional()
  DB_SSL: string = 'false';

  @IsString()
  @IsOptional()
  DB_SYNCHRONIZE: string = 'false';

  @IsString()
  @IsOptional()
  DB_MIGRATIONS_RUN: string = 'false';

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ISSUER: string = EMISOR_TOKEN_DEFAULT;

  @IsString()
  @IsOptional()
  JWT_ISSUER_CHOFERES: string = EMISOR_CHOFERES_DEFAULT;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '8h';

  @IsString()
  @IsOptional()
  JWT_AUDIENCE: string = AUDIENCIA_TOKEN_DEFAULT;

  @IsString()
  @IsOptional()
  JWT_ALGORITHM: string = 'HS256';

  @IsIn(['local', 'federated'])
  @IsOptional()
  AUTH_MODE: string = 'local';

  @IsString()
  @IsOptional()
  JWT_JWKS_URL?: string;

  @IsString() @IsOptional() JWT_MODULE: string = 'residuos';
  @IsString() @IsOptional() EDA_GATEWAY_URL: string =
    'https://test.citypass.mrfranco.net.ar/api/v1';
  @IsString() @IsOptional() EDA_AUTH_URL: string = 'https://api.citypass-login.pp.ua';
  @IsString() @IsOptional() EDA_TOKEN_ISSUER: string = 'https://idp.citypass.local';
  @IsString() @IsOptional() EDA_CLIENT_ID: string = 'grupo6';
  @IsString() @IsOptional() EDA_CLIENT_SECRET?: string;
  @IsString() @IsOptional() EDA_NAMESPACE: string = 'com.citypass.residuos';
  @IsIn(['true', 'false']) @IsOptional() EDA_CONSUMER_ENABLED: string = 'false';
  @IsIn(['true', 'false']) @IsOptional() EDA_CLIMA_SIMULACRO_ENABLED: string = 'false';
  @IsString() @IsOptional() EDA_KAFKA_BROKERS: string = 'test.citypass.mrfranco.net.ar:9092';
  @IsString() @IsOptional() EDA_KAFKA_GROUP_ID: string = 'com.citypass.residuos.residuos-clima-v1';
  @IsIn(['true', 'false']) @IsOptional() EDA_KAFKA_SSL: string = 'true';
  @IsIn(['true', 'false']) @IsOptional() EDA_KAFKA_FROM_BEGINNING: string = 'true';

  @IsString()
  @IsOptional()
  JWT_ADMIN_GROUPS: string = 'administrador';

  @IsString()
  @IsOptional()
  JWT_OPERATOR_GROUPS: string = 'operador,delegados';

  @IsString()
  @IsOptional()
  JWT_DRIVER_GROUPS: string = 'chofer';

  @IsString()
  @IsOptional()
  EVENT_BUS_DRIVER: string = 'inmemory';

  @IsIn(['true', 'false'])
  @IsOptional()
  CLIMA_SIMULADOR_HABILITADO: string = 'true';

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;
}

/**
 * Falla al arrancar si falta una variable de entorno, en vez de fallar en runtime
 * cuando alguien pega el primer request. Es mas barato descubrirlo aca.
 */
export function validarEntorno(config: Record<string, unknown>) {
  const instancia = plainToInstance(VariablesEntorno, config, {
    enableImplicitConversion: true,
  });

  const errores = validateSync(instancia, { skipMissingProperties: false });

  if (errores.length > 0) {
    throw new Error(
      'Configuracion de entorno invalida:\n' +
        errores
          .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
          .join('\n'),
    );
  }

  const faltantesBase = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter(
    (key) => !instancia.DATABASE_URL && instancia[key as keyof VariablesEntorno] === undefined,
  );

  if (faltantesBase.length > 0) {
    throw new Error(
      'Configuracion de entorno invalida:\n' +
        faltantesBase
          .map((key) => `  - ${key}: requerido cuando DATABASE_URL no esta definido`)
          .join('\n'),
    );
  }

  if (instancia.NODE_ENV === Entorno.Production && instancia.EDA_CLIMA_SIMULACRO_ENABLED === 'true')
    throw new Error('Los simulacros climaticos por EDA no se habilitan en produccion');

  if (instancia.AUTH_MODE === 'federated') {
    for (const key of ['JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_JWKS_URL']) {
      if (typeof config[key] !== 'string' || !(config[key] as string).trim()) {
        throw new Error(`${key} debe confirmarse y configurarse en modo federated`);
      }
    }
    const url = new URL(instancia.JWT_JWKS_URL!);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('JWT_JWKS_URL debe ser HTTPS sin credenciales');
    }
  }
  const grupos = [
    instancia.JWT_ADMIN_GROUPS,
    instancia.JWT_OPERATOR_GROUPS,
    instancia.JWT_DRIVER_GROUPS,
  ].flatMap((v) =>
    v
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
  );
  if (new Set(grupos).size !== grupos.length) {
    throw new Error('Un grupo JWT no puede asignar mas de un rol');
  }
  if (instancia.EVENT_BUS_DRIVER === 'platform' || instancia.EDA_CONSUMER_ENABLED === 'true') {
    for (const key of [
      'EDA_CLIENT_ID',
      'EDA_CLIENT_SECRET',
      'EDA_NAMESPACE',
      'EDA_GATEWAY_URL',
      'EDA_AUTH_URL',
    ] as const) {
      if (!instancia[key]?.trim()) throw new Error(`${key} es obligatorio para EDA`);
    }
    if (instancia.EDA_NAMESPACE !== 'com.citypass.residuos')
      throw new Error('EDA_NAMESPACE debe ser com.citypass.residuos');
    for (const key of ['EDA_GATEWAY_URL', 'EDA_AUTH_URL'] as const) {
      const url = new URL(instancia[key]);
      const local =
        instancia.NODE_ENV !== Entorno.Production &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error(`${key} requiere HTTPS (HTTP solo en localhost de desarrollo/test)`);
    }
    if (instancia.EDA_CONSUMER_ENABLED === 'true') {
      if (!instancia.EDA_KAFKA_GROUP_ID.startsWith(`${instancia.EDA_NAMESPACE}.`))
        throw new Error('EDA_KAFKA_GROUP_ID debe pertenecer al namespace de Residuos');
      if (!instancia.EDA_KAFKA_BROKERS.trim()) throw new Error('Falta EDA_KAFKA_BROKERS');
      if (instancia.NODE_ENV === Entorno.Production && instancia.EDA_KAFKA_SSL !== 'true')
        throw new Error('Kafka de produccion requiere TLS');
    }
  }
  return instancia;
}
