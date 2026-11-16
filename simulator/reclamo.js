/**
 * Hace de modulo de Reclamos (Grupo 5) para demostrar CU-INT-02 sin depender de
 * que ellos esten publicando: manda al webhook de Residuos los mismos eventos
 * que mandaria el gateway, con el formato de su contrato del 22/10.
 *
 *   npm run reclamo                  auto frente a la proxima parada de una ruta en curso
 *   npm run reclamo -- --lejos       auto a 100 m: no tapa nada
 *   npm run reclamo -- --bache       un pozo en la bicisenda al lado del contenedor: se ignora
 *   npm run reclamo -- --contenedor FRAN-02   tapa ese contenedor en vez de la proxima parada
 *   npm run reclamo -- --ruta <id>   elige la ruta; sin esto, la activa del camion CAMION_DEMO (FR123AN)
 *   npm run reclamo:resuelto         Reclamos avisa que se retiro el auto (el ultimo que tapo uno)
 *   npm run reclamo:resuelto -- <reclamoId>
 *
 * Requiere:
 *   WEBHOOK_TOKEN  el GATEWAY_WEBHOOK_TOKEN del backend
 *   y para leer la ruta, una de dos:
 *     TOKEN                        en local:  cd ../backend && npm run token:dev -- ADMINISTRADOR
 *     LOGIN_USER y LOGIN_PASSWORD  en Render: el simulador inicia sesion en Login como el front,
 *                                  asi no vence el token copiado de F12 (dura ~15 min).
 * Las variables pueden ir en simulator/.env (ignorado por git); lo exportado en la terminal gana.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

try {
  process.loadEnvFile();
} catch {
  // Sin .env se usan las variables de la terminal.
}

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const IDP = process.env.IDP_URL ?? 'https://api.citypass-login.pp.ua';
let TOKEN = process.env.TOKEN;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;
const ULTIMO_RECLAMO = 'ultimo-reclamo.txt';
const CAMION_DEMO = process.env.CAMION_DEMO ?? 'FR123AN';

// El OBSTRUCCION_RADIO_METROS del backend, solo para explicar la decision en pantalla.
const RADIO_METROS = 15;

// ~5 m al norte del contenedor: adentro del radio de 15 m. Con --lejos, ~100 m.
const GRADOS_CERCA = 0.000045;
const GRADOS_LEJOS = 0.0009;

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};

function exigir(variable, valor, comoConseguirla) {
  if (!valor) {
    console.error(`Falta la variable ${variable}. ${comoConseguirla}`);
    process.exit(1);
  }
}

/** El mismo /auth/login que usa el front: un token nuevo en cada corrida. */
async function iniciarSesion() {
  const { LOGIN_USER, LOGIN_PASSWORD } = process.env;
  if (!LOGIN_USER || !LOGIN_PASSWORD) {
    console.error(
      'Falta TOKEN, o LOGIN_USER y LOGIN_PASSWORD para iniciar sesion en Login:\n' +
        "  read -p 'Usuario: ' LOGIN_USER && read -s -p 'Contraseña: ' LOGIN_PASSWORD && export LOGIN_USER LOGIN_PASSWORD",
    );
    process.exit(1);
  }

  const respuesta = await fetch(`${IDP}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: LOGIN_USER, password: LOGIN_PASSWORD, clientId: 'citypass-residuos-web' }),
  });

  if (!respuesta.ok) {
    throw new Error(`Login -> ${respuesta.status}: revisa LOGIN_USER y LOGIN_PASSWORD.`);
  }

  return (await respuesta.json()).access_token;
}

async function api(ruta) {
  const respuesta = await fetch(`${API}${ruta}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (!respuesta.ok) {
    throw new Error(`GET ${ruta} -> ${respuesta.status} ${await respuesta.text()}`);
  }

  return respuesta.json();
}

/** Lo mismo que entrega el gateway del Grupo 1: metadata + los campos de negocio. */
async function webhook(eventType, data) {
  const respuesta = await fetch(`${API}/webhooks/citypass?token=${WEBHOOK_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metadata: { eventId: randomUUID(), eventType, source: 'reclamos', receivedAt: Date.now() },
      data,
    }),
  });

  if (respuesta.status !== 204) {
    throw new Error(`webhook ${eventType} -> ${respuesta.status} ${await respuesta.text()}`);
  }
}

async function rutaParaLaDemo() {
  const id = opcion('--ruta');
  if (id) {
    return api(`/rutas/${id}`);
  }

  // En Render puede haber rutas de otros ensayos: primero la del camion de la demo.
  const activas = [...(await api('/rutas?estado=EN_CURSO')), ...(await api('/rutas?estado=ASIGNADA'))];
  const ruta = activas.find((r) => r.camion?.patente === CAMION_DEMO) ?? activas[0];
  if (ruta) {
    return api(`/rutas/${ruta.id}`);
  }

  console.error('No hay ninguna ruta EN_CURSO ni ASIGNADA. Genera y asigna una desde el front.');
  process.exit(1);
}

/**
 * Por que Residuos hizo lo que hizo, para que se vea en B y C, donde la ruta no
 * cambia. Usa la consulta publica de contenedores cercanos (CU-11).
 */
async function explicar(lat, lng, bache) {
  const respuesta = await fetch(`${API}/publico/contenedores/cercanos?lat=${lat}&lng=${lng}&radioMetros=500`);
  const [cerca] = respuesta.ok ? await respuesta.json() : [];
  const distancia = cerca && Math.round(cerca.distanciaMetros);
  const masCerca = cerca ? `${cerca.codigo}, a ${distancia} m` : 'ninguno a menos de 500 m';

  console.log(`\nContenedor mas cerca del reclamo: ${masCerca}.`);
  if (bache) {
    console.log('-> Es un pozo (BACHES), no un vehiculo: al camion no le impide vaciarlo. Residuos lo ignora.');
  } else if (cerca && distancia <= RADIO_METROS) {
    console.log(`-> Adentro de los ${RADIO_METROS} m: Residuos omite la parada, abre la alerta y publica ReclamoEvaluado (afectaRecoleccion: true).`);
  } else {
    console.log(`-> Afuera de los ${RADIO_METROS} m: Residuos no toca la ruta y publica ReclamoEvaluado (afectaRecoleccion: false).`);
  }
}

function mostrar(titulo, ruta) {
  console.log(`\n${titulo}: ruta ${ruta.id.slice(0, 8)} · ${ruta.estado} · ${ruta.distanciaEstimadaKm} km`);

  for (const parada of [...ruta.paradas].sort((a, b) => a.orden - b.orden)) {
    const motivo = parada.motivo ? `  <- ${parada.motivo}` : '';
    console.log(`  ${parada.orden}. ${parada.contenedor.codigo}  ${parada.estado}${motivo}`);
  }
}

async function crear() {
  const antes = await rutaParaLaDemo();
  const codigo = opcion('--contenedor');
  const objetivo = [...antes.paradas]
    .sort((a, b) => a.orden - b.orden)
    .find((p) => p.estado === 'PENDIENTE' && (!codigo || p.contenedor.codigo === codigo));

  if (!objetivo) {
    console.error(codigo ? `${codigo} no esta pendiente en la ruta.` : 'La ruta no tiene paradas pendientes.');
    process.exit(1);
  }

  mostrar('Antes', antes);

  const lejos = args.includes('--lejos');
  const bache = args.includes('--bache');
  const reclamoId = randomUUID();
  const { lng } = objetivo.contenedor;
  const lat = objetivo.contenedor.lat + (lejos ? GRADOS_LEJOS : GRADOS_CERCA);
  const que = bache ? 'un pozo' : 'un auto';

  // Payload del contrato de Reclamos (v3): TRANSITO con el auto en el titulo, o
  // BACHES para un pozo, los dos sobre la CICLOVIA.
  await webhook('com.citypass.reclamos.ReclamoCreado', {
    reclamoId,
    ciudadanoId: 'U000042',
    canal: 'APP',
    titulo: bache ? 'Pozo en la bicisenda' : 'Auto estacionado sobre la ciclovia',
    descripcion: `Hay ${que} en la bicisenda, al lado del contenedor ${objetivo.contenedor.codigo}`,
    categoria: bache ? 'BACHES' : 'TRANSITO',
    objetoAfectado: 'CICLOVIA',
    prioridad: 'ALTA',
    origenClasificacion: 'CIUDADANO',
    confianzaClasificacion: null,
    direccion: 'Demo',
    barrio: 'Centro',
    latitud: lat,
    longitud: lng,
    afectaCirculacion: true,
    correlationId: `demo-${reclamoId.slice(0, 8)}`,
    createdAt: Date.now(),
  });

  // Solo el que tapa: B y C no pisan el que despues libera reclamo:resuelto.
  if (!lejos && !bache) {
    writeFileSync(ULTIMO_RECLAMO, reclamoId);
  }
  console.log(
    `\nReclamo ${reclamoId} enviado: ${que} a ${lejos ? '~100 m' : '~5 m'} de ${objetivo.contenedor.codigo}.`,
  );
  await explicar(lat, lng, bache);

  mostrar('Despues', await api(`/rutas/${antes.id}`));
  if (!bache && !lejos) {
    console.log('\nPara liberarlo:  npm run reclamo:resuelto');
  }
}

async function resolver() {
  const reclamoId = args.slice(1).find((a) => !a.startsWith('--')) ?? leerUltimo();

  await webhook('com.citypass.reclamos.ReclamoActualizado', {
    reclamoId,
    ciudadanoId: 'U000042',
    estadoAnterior: 'EN_PROCESO',
    estadoNuevo: 'RESUELTO',
    motivo: 'Se retiro el vehiculo',
    asignadoA: 'cuadrilla-3',
    cambiadoPor: 'operador-1',
    correlationId: `demo-${reclamoId.slice(0, 8)}`,
    updatedAt: Date.now(),
  });

  console.log(`Reclamo ${reclamoId} resuelto: el contenedor vuelve a entrar en la proxima ruta.`);
}

function leerUltimo() {
  try {
    return readFileSync(ULTIMO_RECLAMO, 'utf8').trim();
  } catch {
    console.error('No hay un reclamo anterior. Pasa el id:  npm run reclamo:resuelto -- <reclamoId>');
    process.exit(1);
  }
}

exigir('WEBHOOK_TOKEN', WEBHOOK_TOKEN, 'Es el GATEWAY_WEBHOOK_TOKEN del backend.');

// Resolver solo usa el webhook: no necesita sesion.
(args[0] === 'resuelto'
  ? resolver()
  : (async () => {
      TOKEN ||= await iniciarSesion();
      await crear();
    })()
).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
