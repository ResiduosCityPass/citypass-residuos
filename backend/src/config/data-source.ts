import { config as cargarEnv } from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * DataSource que usa el CLI de TypeORM para generar y correr migraciones.
 *
 * Es una definicion aparte de `typeorm.config.ts` a proposito: aquella la
 * construye Nest a partir del ConfigService cuando la aplicacion arranca, y el
 * CLI corre fuera de Nest, sin contenedor de inyeccion.
 *
 * Uso:
 *   npm run migration:generate -- src/migrations/NombreDeLaMigracion
 *   npm run migration:run
 *
 * `synchronize` esta en false y no se toca: el CLI tiene que comparar contra el
 * esquema real, no modificarlo por su cuenta.
 */
cargarEnv();

const connectionOptions = process.env.DATABASE_URL
  ? { url: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

export default new DataSource({
  type: 'postgres',
  ...connectionOptions,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
});
