import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

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
  DB_HOST!: string;

  @IsInt()
  DB_PORT!: number;

  @IsString()
  DB_USER!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_NAME!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  EVENT_BUS_DRIVER: string = 'inmemory';
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

  return instancia;
}
