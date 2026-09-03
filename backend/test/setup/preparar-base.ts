import { config as cargarEnv } from 'dotenv';
import { Client } from 'pg';
import { DataSource } from 'typeorm';

/**
 * Prepara la base de datos de los tests de integracion.
 *
 * Corre una sola vez antes de toda la suite:
 *   1. apunta la configuracion a una base separada de la de desarrollo,
 *   2. la crea si no existe,
 *   3. le aplica las migraciones.
 *
 * El esquema sale de las migraciones y no de `synchronize`: si los tests
 * corrieran contra un esquema autogenerado, pasarian aun cuando la migracion
 * este rota, que es justo lo que se despliega.
 *
 * Se pisa `process.env` antes que nada porque el ConfigModule de Nest carga el
 * `.env` sin sobreescribir lo que ya este definido.
 */
export default async function prepararBase(): Promise<void> {
  cargarEnv();

  const nombreBase = process.env.DB_NAME_TEST ?? 'residuos_test';

  process.env.NODE_ENV = 'test';
  process.env.DB_NAME = nombreBase;
  process.env.DB_SYNCHRONIZE = 'false';
  process.env.EVENT_BUS_DRIVER = 'inmemory';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-de-tests';

  const admin = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });

  await admin.connect();
  const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombreBase]);

  if (existe.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${nombreBase}"`);
  }

  await admin.end();

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: nombreBase,
    entities: [__dirname + '/../../src/**/*.entity.ts'],
    migrations: [__dirname + '/../../src/migrations/*.ts'],
    synchronize: false,
  });

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
