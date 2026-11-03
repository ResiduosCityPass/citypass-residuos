import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { parseArgs } from 'util';
import {
  credencialChoferDemo,
  planEscenarioInundacion,
  prepararEscenarioInundacion,
} from '../shared/demo/escenario-inundacion';

async function main() {
  const { values } = parseArgs({
    options: {
      escenario: { type: 'string' },
      apply: { type: 'boolean', default: false },
      credencial: { type: 'string' },
    },
  });
  if (!values.escenario)
    throw new Error(
      'Uso: demo:preparar -- --escenario CLIMA01 [--apply] [--credencial .demo/CLIMA01.jwt]',
    );
  const plan = planEscenarioInundacion(values.escenario);
  if (!values.apply) {
    console.log(
      JSON.stringify(
        { modo: 'plan', escribeEnBase: false, publicaEventos: false, ...plan },
        null,
        2,
      ),
    );
    return;
  }
  cargarEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });
  if (values.credencial && !process.env.JWT_SECRET?.trim())
    throw new Error('Falta JWT_SECRET para la credencial.');
  // El CLI solo abre TypeORM: nunca arranca el consumidor Kafka ni el dispatcher.
  const { default: db } = await import('../config/data-source');
  await db.initialize();
  try {
    if (await db.showMigrations())
      throw new Error(
        'Hay migraciones pendientes. Ejecuta migration:run antes de preparar la demo.',
      );
    const resultado = await prepararEscenarioInundacion(db, plan.escenario);
    if (values.credencial) {
      const salida = resolve(values.credencial);
      const token = await credencialChoferDemo(db, plan.escenario, process.env);
      mkdirSync(dirname(salida), { recursive: true, mode: 0o700 });
      // No sobrescribe archivos ni sigue un enlace existente. Nunca imprime el JWT.
      writeFileSync(salida, token + '\n', { flag: 'wx', mode: 0o600 });
      console.log(`Credencial de chofer (2 horas): ${salida}`);
    }
    console.log(JSON.stringify(resultado, null, 2));
  } finally {
    await db.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo preparar la demo.');
  process.exitCode = 1;
});
