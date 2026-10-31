/**
 * Simula a Espacios publicando una actividad masiva (caso transversal del squad 3).
 *
 * Manda `com.citypass.espacios.ActividadCreada` al webhook de Residuos, igual
 * que lo haria el bus de CityPass+. Sirve para la demo y como plan B: si el bus
 * o Espacios se caen en vivo, la historia sigue con este comando.
 *
 * Por defecto el festival empezo hace 3 h y termina en 10 minutos: asi la zona
 * aparece en el mapa con la cuenta regresiva y, al terminar, la escuadrilla ya
 * puede salir.
 *
 * **Donde:** con `--contenedor CT-0005` se arma al lado de ese contenedor, asi
 * la escuadrilla seguro tiene algo que levantar (necesita TOKEN para buscarlo).
 * Sin eso es en el Obelisco, pero el seed reparte los contenedores hasta a 1 km
 * y puede que ninguno quede dentro de los 300 m.
 *
 * Uso:
 *   TOKEN=<token> npm run actividad -- --contenedor CT-0005
 *   node actividad-masiva.js --termina-en 0            (ya termino: la escuadrilla sale ya)
 *   node actividad-masiva.js --titulo "Recital" --capacidad 3000 --lat -34.6128 --lng -58.3751
 *
 * Variables de entorno:
 *   API_URL        default http://localhost:3000/api/v1
 *   WEBHOOK_TOKEN  el GATEWAY_WEBHOOK_TOKEN del backend (default local-dev)
 *   TOKEN          token de operador o administrador, solo para --contenedor
 */
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = process.env.WEBHOOK_TOKEN ?? 'local-dev';

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

/** Obelisco: el centro alrededor del cual el seed crea los contenedores. */
const OBELISCO = { lat: -34.6037, lng: -58.3816 };

async function ubicacion() {
  const codigo = leerArgumento('contenedor', null);
  if (!codigo) {
    return {
      lat: Number(leerArgumento('lat', OBELISCO.lat)),
      lng: Number(leerArgumento('lng', OBELISCO.lng)),
    };
  }

  if (!process.env.TOKEN) {
    console.error('Para usar --contenedor hace falta TOKEN (npm run token:dev -- ADMINISTRADOR).');
    process.exit(1);
  }
  const respuesta = await fetch(`${API}/mapa/contenedores`, {
    headers: { Authorization: `Bearer ${process.env.TOKEN}` },
  });
  if (!respuesta.ok) {
    console.error(`No pude leer los contenedores (${respuesta.status}). ¿Vencio el TOKEN?`);
    process.exit(1);
  }
  const contenedor = (await respuesta.json()).find((c) => c.codigo === codigo);
  if (!contenedor) {
    console.error(`No existe el contenedor ${codigo}.`);
    process.exit(1);
  }
  return { lat: contenedor.lat, lng: contenedor.lng };
}

const MINUTO = 60_000;
const punto = await ubicacion();
const terminaEn = Number(leerArgumento('termina-en', 10));
const fin = new Date(Date.now() + terminaEn * MINUTO);
const inicio = new Date(Math.min(Date.now() - 3 * 60 * MINUTO, fin.getTime() - 60 * MINUTO));

const actividadId = randomUUID();
const data = {
  correlationId: `act-${actividadId}`,
  actividadId,
  titulo: leerArgumento('titulo', 'Festival de Primavera'),
  estado: 'PROGRAMADA',
  capacidad: Number(leerArgumento('capacidad', 5000)),
  fechaHoraInicio: inicio.getTime(),
  fechaHoraFinalizacion: fin.getTime(),
  ubicacion: { lat: punto.lat, lng: punto.lng },
  direccion: 'Direccion de prueba',
  espacioNombre: 'Espacio de prueba',
  actorSub: null,
};

const respuesta = await fetch(`${API}/webhooks/citypass?token=${encodeURIComponent(TOKEN)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    metadata: { eventId: randomUUID(), eventType: 'com.citypass.espacios.ActividadCreada' },
    data,
  }),
});

if (!respuesta.ok) {
  console.error(`El webhook respondio ${respuesta.status}: ${await respuesta.text()}`);
  if (respuesta.status === 401) {
    console.error('Revisa que WEBHOOK_TOKEN sea igual a GATEWAY_WEBHOOK_TOKEN del backend.');
  }
  process.exit(1);
}

console.log(`Enviada: "${data.titulo}", ${data.capacidad} personas.`);
const hora = fin.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
console.log(`Termina ${terminaEn > 0 ? `en ${terminaEn} min` : 'ya'} (a las ${hora}).`);
console.log('Mira el mapa: la zona aparece con el proximo refresco (30 s) o con "Refrescar ahora".');
