import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import {
  constants,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ClienteDemoHttp, urlDemo } from '../shared/demo/cliente-demo-http';
import {
  EscenarioHttp,
  ETAPAS_DEMO,
  EtapaDemo,
  planDemoHttp,
  prepararDemoHttp,
  verificarDemoHttp,
} from '../shared/demo/demo-http';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      escenario: { type: 'string' },
      patente: { type: 'string' },
      api: { type: 'string' },
      apply: { type: 'boolean', default: false },
      etapa: { type: 'string' },
      alerta: { type: 'string' },
    },
  });
  const modo = positionals[0];
  if (positionals.length !== 1 || !['plan', 'preparar', 'verificar'].includes(modo))
    throw new Error(
      'Uso: demo:http plan|preparar|verificar. Ver docs/arquitectura/prueba-operativa-http.md.',
    );
  if (!values.api) throw new Error('Indicá --api con la URL completa, incluido /api/v1.');
  const nombre = values.escenario?.trim().toUpperCase();
  if (!nombre || !/^[A-Z][A-Z0-9]{0,9}$/.test(nombre))
    throw new Error('Indicá --escenario con 1 a 10 letras/números, empezando con una letra.');
  const apiUrl = urlDemo(values.api);
  let plan: ReturnType<typeof planDemoHttp> | undefined;
  if (modo !== 'verificar') {
    if (!values.patente) throw new Error('Falta --patente.');
    plan = planDemoHttp(nombre, values.patente);
    if (modo === 'plan' || !values.apply) {
      console.log(
        JSON.stringify(
          {
            apiUrl,
            escribe: false,
            plan,
            aviso:
              'Con preparar --apply se crean sensores y se publican los eventos normales de lectura y rutas. No dispara alertas climáticas.',
          },
          null,
          2,
        ),
      );
      return;
    }
  } else {
    if (values.apply) throw new Error('verificar es solo lectura; no usa --apply.');
    if (!ETAPAS_DEMO.includes(values.etapa as EtapaDemo))
      throw new Error(`Indicá --etapa (${ETAPAS_DEMO.join(', ')}).`);
    if (values.etapa !== 'preparada' && !values.alerta)
      throw new Error('Falta --alerta con el ID de Espacios.');
  }
  // El argumento identifica un escenario; nunca es una ruta de archivos arbitraria.
  const raiz = realpathSync(process.cwd());
  const directorio = resolve(raiz, '.demo', 'http', nombre);
  for (const carpeta of [resolve(raiz, '.demo'), resolve(raiz, '.demo/http'), directorio]) {
    if (
      existsSync(carpeta) &&
      (lstatSync(carpeta).isSymbolicLink() || !lstatSync(carpeta).isDirectory())
    )
      throw new Error(
        'Las carpetas de escenarios deben ser directorios locales, sin enlaces simbólicos.',
      );
  }
  let manifest: { apiUrl: string; escenario: EscenarioHttp } | undefined;
  if (modo === 'verificar') {
    const descriptor = openSync(
      resolve(directorio, 'escenario.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      manifest = JSON.parse(readFileSync(descriptor, 'utf8')) as typeof manifest;
    } finally {
      closeSync(descriptor);
    }
    if (manifest?.apiUrl !== apiUrl) throw new Error('La API no coincide con la del manifiesto.');
  }
  cargarEnv({ path: process.env.ENV_FILE ?? '.env.demo.http.local', quiet: true });
  let access: string;
  let refresh: string | undefined;
  const idp = urlDemo(process.env.DEMO_IDP_URL ?? 'https://api.citypass-login.pp.ua');
  if (process.env.DEMO_TOKEN_FILE) {
    access = readFileSync(process.env.DEMO_TOKEN_FILE, 'utf8').trim();
    if (!access) throw new Error('El archivo de token está vacío.');
  } else {
    if (!process.env.DEMO_USUARIO || !process.env.DEMO_PASSWORD)
      throw new Error(
        'Configurá DEMO_USUARIO y DEMO_PASSWORD en .env.demo.http.local (ignorado por Git).',
      );
    const response = await fetch(`${idp}/auth/login`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.DEMO_USUARIO,
        password: process.env.DEMO_PASSWORD,
        clientId: process.env.DEMO_CLIENT_ID ?? 'citypass-residuos-web',
      }),
    });
    if (!response.ok) throw new Error(`Login: HTTP ${response.status}`);
    const pair = (await response.json()) as { access_token: string; refresh_token: string };
    access = pair.access_token;
    refresh = pair.refresh_token;
  }
  try {
    const api = new ClienteDemoHttp(apiUrl, access);
    if (modo === 'verificar') {
      console.log(
        JSON.stringify(
          await verificarDemoHttp(
            api,
            manifest!.escenario,
            values.etapa as EtapaDemo,
            values.alerta,
          ),
          null,
          2,
        ),
      );
      return;
    }
    // Reserva un directorio nuevo antes de la primera escritura remota. No pisa
    // un JWT anterior ni reintenta a ciegas un alta que sufrió un timeout.
    mkdirSync(resolve(directorio, '..'), { recursive: true, mode: 0o700 });
    mkdirSync(directorio, { mode: 0o700 });
    const altas: { tipo: string; id: string }[] = [];
    const registro = resolve(directorio, 'registro.json');
    const guardar = (estado: string) =>
      writeFileSync(
        registro,
        JSON.stringify({ apiUrl, escenario: plan!.escenario, estado, altas }, null, 2),
        { mode: 0o600 },
      );
    guardar('EN_PREPARACION');
    try {
      const resultado = await prepararDemoHttp(api, plan!, (tipo, id) => {
        altas.push({ tipo, id });
        guardar('EN_PREPARACION');
      });
      writeFileSync(resolve(directorio, 'chofer.jwt'), resultado.tokenChofer + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      writeFileSync(
        resolve(directorio, 'escenario.json'),
        JSON.stringify({ apiUrl, escenario: resultado.escenario }, null, 2),
        { flag: 'wx', mode: 0o600 },
      );
      await verificarDemoHttp(api, resultado.escenario, 'preparada');
      guardar('PREPARADA');
      console.log(
        JSON.stringify(
          {
            preparada: true,
            directorio,
            escenario: resultado.escenario,
            aviso:
              'Credencial privada en chofer.jwt. Publicá la alerta desde Espacios y seleccioná solo la zona Centro de este escenario.',
          },
          null,
          2,
        ),
      );
    } catch (error) {
      guardar('INCOMPLETA');
      throw new Error(
        `Preparación incompleta. Revisá ${registro}; no borres evidencia ni repitas el alta. ${error instanceof Error ? error.message : ''}`,
      );
    }
  } finally {
    if (refresh) {
      const logout = await fetch(`${idp}/auth/logout`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      }).catch(() => null);
      if (!logout?.ok) console.error('No se pudo confirmar el logout de la sesión del CLI.');
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo completar la prueba.');
  process.exitCode = 1;
});
