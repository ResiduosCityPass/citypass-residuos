import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

/**
 * Emisor con el que se firman y se leen los tokens.
 *
 * Tiene un valor por defecto porque la aplicacion tiene que poder arrancar sin
 * un `.env`: el CI no tiene uno, y `jsonwebtoken` rechaza `issuer: undefined`
 * con "issuer must be a string" recien al firmar el primer token, no al
 * arrancar. En el Sprint 3 pasa a ser el emisor del Squad 2, por configuracion.
 */
export const EMISOR_TOKEN_DEFAULT = 'citypass-squad2';

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
  JWT_EXPIRES_IN: string = '8h';

  @IsString()
  @IsOptional()
  JWT_AUDIENCE: string = AUDIENCIA_TOKEN_DEFAULT;

  @IsString()
  @IsOptional()
  JWT_ALGORITHM: string = 'HS256';

  @IsString()
  @IsOptional()
  EVENT_BUS_DRIVER: string = 'inmemory';

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

  return instancia;
}
