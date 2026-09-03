import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const buildTypeOrmOptions = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get<string>('DB_HOST'),
  port: config.get<number>('DB_PORT'),
  username: config.get<string>('DB_USER'),
  password: config.get<string>('DB_PASSWORD'),
  database: config.get<string>('DB_NAME'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  // El esquema lo definen las migraciones (ADR-002). Esta bandera queda como
  // escape para levantar una base descartable rapido, pero por defecto va en
  // false: si dos maquinas corren con synchronize, cada una termina con el
  // esquema que le dejo su ultima rama y nadie se entera hasta el deploy.
  synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
  migrationsRun: config.get<string>('DB_MIGRATIONS_RUN') === 'true',
  logging: config.get<string>('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
});
