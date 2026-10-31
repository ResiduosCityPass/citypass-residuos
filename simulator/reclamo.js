/**
 * Hace de modulo de Reclamos (Grupo 5) para demostrar CU-INT-02 sin depender de
 * que ellos esten publicando: manda al webhook de Residuos los mismos eventos
 * que mandaria el gateway, con el formato de su contrato del 22/10.
 *
 *   npm run reclamo                  auto frente a la proxima parada de una ruta en curso
 *   npm run reclamo -- --lejos       auto a 100 m: no tapa nada
 *   npm run reclamo -- --ruta <id>   elige la ruta en vez de tomar la primera activa
 *   npm run reclamo:resuelto         Reclamos avisa que se retiro el auto (usa el ultimo reclamo)
 *   npm run reclamo:resuelto -- <reclamoId>
 *
 * Requiere:
 *   TOKEN          token de administrador:  cd ../backend && npm run token:dev -- ADMINISTRADOR
 *   WEBHOOK_TOKEN  el GATEWAY_WEBHOOK_TOKEN del .env del backend
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = process.env.TOKEN;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;
const ULTIMO_RECLAMO = 'ultimo-reclamo.txt';

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

  for (const estado of ['EN_CURSO', 'ASIGNADA']) {
    const [ruta] = await api(`/rutas?estado=${estado}`);
    if (ruta) {
      return api(`/rutas/${ruta.id}`);
    }
  }

  console.error('No hay ninguna ruta EN_CURSO ni ASIGNADA. Genera y asigna una desde el front.');
  process.exit(1);
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
  const objetivo = [...antes.paradas]
    .sort((a, b) => a.orden - b.orden)
    .find((p) => p.estado === 'PENDIENTE');

  if (!objetivo) {
    console.error('La ruta no tiene paradas pendientes.');
    process.exit(1);
  }

  mostrar('Antes', antes);

  const lejos = args.includes('--lejos');
  const reclamoId = randomUUID();
  const { lat, lng } = objetivo.contenedor;

  // Payload del contrato de Reclamos: categoria TRANSITO y el auto en el titulo.
  await webhook('com.citypass.reclamos.ReclamoCreado', {
    reclamoId,
    ciudadanoId: 'U000042',
    canal: 'APP',
    titulo: 'Auto estacionado sobre la ciclovia',
    descripcion: `Hay un auto arriba de la bicisenda, al lado del contenedor ${objetivo.contenedor.codigo}`,
    categoria: 'TRANSITO',
    prioridad: 'ALTA',
    origenClasificacion: 'CIUDADANO',
    confianzaClasificacion: null,
    direccion: 'Demo',
    barrio: 'Centro',
    latitud: lat + (lejos ? GRADOS_LEJOS : GRADOS_CERCA),
    longitud: lng,
    afectaCirculacion: true,
    correlationId: `demo-${reclamoId.slice(0, 8)}`,
    createdAt: Date.now(),
  });

  writeFileSync(ULTIMO_RECLAMO, reclamoId);
  console.log(
    `\nReclamo ${reclamoId} enviado: auto a ${lejos ? '~100 m' : '~5 m'} de ${objetivo.contenedor.codigo}.`,
  );

  mostrar('Despues', await api(`/rutas/${antes.id}`));
  console.log('\nEn la consola del backend aparece [residuos.reclamo.evaluado] en menos de 5 s.');
  console.log('Para liberarlo:  npm run reclamo:resuelto');
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

exigir('TOKEN', TOKEN, 'Generala con:  cd ../backend && npm run token:dev -- ADMINISTRADOR');
exigir('WEBHOOK_TOKEN', WEBHOOK_TOKEN, 'Es el GATEWAY_WEBHOOK_TOKEN del .env del backend.');

(args[0] === 'resuelto' ? resolver() : crear()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
