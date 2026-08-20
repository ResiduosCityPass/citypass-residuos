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
  // Solo en desarrollo. A partir del Sprint 2 se usan migraciones explicitas (ADR-002).
  synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
  logging: config.get<string>('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
});
