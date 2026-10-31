/**
 * Suscribe el webhook de Residuos al bus de CityPass+ (paso 5 del squad 3).
 *
 * El bus no busca a nadie: cada modulo da de alta la URL publica de su webhook
 * para un tipo de evento, y desde ahi el bus le hace un POST por cada evento.
 * Residuos solo recibe `com.citypass.espacios.ActividadCreada`.
 *
 * La URL que se registra es la del backend en Render con el secreto del webhook
 * (`?token=`): tiene que ser publica, `localhost` no le sirve al bus.
 *
 * Uso:
 *   npm run bus -- suscribir          da de alta el webhook (guarda el id que devuelve)
 *   npm run bus -- listar             las suscripciones de Residuos y si estan activas
 *   npm run bus -- fallidos           los eventos que el bus no pudo entregar
 *   npm run bus -- baja <id>          da de baja una suscripcion
 *   npm run bus -- suscribir --topico com.citypass.espacios.ActividadCancelada
 *
 * Variables de entorno:
 *   BUS_URL         URL publica del bus (la pasa Franco, EDA). Sin barra final
 *   CLIENT_ID       cliente de servicio de Residuos (lo pasa Nicolas, Login)
 *   CLIENT_SECRET   su secreto. Con estos dos el script pide el token solo
 *   BUS_TOKEN       en vez de los dos de arriba, un token ya emitido (dura 15 min)
 *   TOKEN_URL       default https://api.citypass-login.pp.ua/oauth/token
 *   API_URL         default https://citypass-residuos-api.onrender.com/api/v1
 *   WEBHOOK_TOKEN   el GATEWAY_WEBHOOK_TOKEN configurado en Render (solo para suscribir)
 */

const TOPICO = 'com.citypass.espacios.ActividadCreada';
const BUS = process.env.BUS_URL;
const TOKEN_URL = process.env.TOKEN_URL ?? 'https://api.citypass-login.pp.ua/oauth/token';
const API = process.env.API_URL ?? 'https://citypass-residuos-api.onrender.com/api/v1';

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

function fallar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

async function obtenerToken() {
  if (process.env.BUS_TOKEN) {
    return process.env.BUS_TOKEN;
  }

  const { CLIENT_ID, CLIENT_SECRET } = process.env;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    fallar('Falta BUS_TOKEN, o CLIENT_ID y CLIENT_SECRET (los pasa Nicolas, Login).');
  }

  const respuesta = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!respuesta.ok) {
    fallar(`El Login respondio ${respuesta.status} al pedir el token. ¿Esta bien el secreto?`);
  }

  const { access_token: token } = await respuesta.json();
  const { namespace } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  if (namespace !== 'com.citypass.residuos') {
    console.warn(`Ojo: el token es de ${namespace}, no de com.citypass.residuos.`);
  }
  return token;
}

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${BUS}/api/v1${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await obtenerToken()}`,
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    fallar(`El bus respondio ${respuesta.status}: ${texto}`);
  }
  return texto ? JSON.parse(texto) : null;
}

async function suscribir() {
  const secreto = process.env.WEBHOOK_TOKEN;
  if (!secreto) {
    fallar('Falta WEBHOOK_TOKEN: el mismo valor de GATEWAY_WEBHOOK_TOKEN en Render.');
  }

  // Antes de registrar, que el webhook este despierto y acepte el secreto. Un
  // sobre vacio no guarda nada: con el secreto bien da 400 (mal formado), mal da 401.
  const prueba = await fetch(`${API}/webhooks/citypass?token=${encodeURIComponent(secreto)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (prueba.status === 401) {
    fallar('El webhook rechazo WEBHOOK_TOKEN: no coincide con GATEWAY_WEBHOOK_TOKEN de Render.');
  }
  if (prueba.status !== 400) {
    fallar(`El webhook respondio ${prueba.status}. ¿Esta desplegado el backend en ${API}?`);
  }

  const topico = leerArgumento('topico', TOPICO);
  const alta = await pedir('POST', '/subscriptions', {
    topic: topico,
    callbackUrl: `${API}/webhooks/citypass?token=${encodeURIComponent(secreto)}`,
  });
  console.log(`Suscripto a ${alta.topic}.`);
  console.log(`Id: ${alta.id}  (guardalo: es para darla de baja)`);
}

async function listar() {
  const suscripciones = await pedir('GET', '/subscriptions');
  if (suscripciones.length === 0) {
    console.log('No hay suscripciones.');
  }
  for (const s of suscripciones) {
    const silenciada = s.status === 'silenced' ? ` (silenciada hasta ${s.silencedUntil})` : '';
    // La URL lleva el secreto del webhook: se muestra sin el ?token=.
    console.log(`${s.id}  ${s.topic}  ${s.callbackUrl.split('?')[0]}  ${s.status}${silenciada}`);
  }
}

async function fallidos() {
  const entradas = await pedir('GET', '/dead-letters?limit=10');
  console.log(entradas.length === 0 ? 'No hay eventos sin entregar.' : JSON.stringify(entradas, null, 2));
}

async function baja(id) {
  if (!id) {
    fallar('Falta el id: npm run bus -- baja <id> (sale en "listar").');
  }
  await pedir('DELETE', `/subscriptions/${id}`);
  console.log(`Suscripcion ${id} dada de baja.`);
}

if (!BUS) {
  fallar('Falta BUS_URL: la URL publica del bus (la pasa Franco, EDA).');
}

const [comando, id] = process.argv.slice(2);
const comandos = { suscribir, listar, fallidos, baja: () => baja(id) };
if (!comandos[comando]) {
  fallar('Uso: npm run bus -- suscribir | listar | fallidos | baja <id>');
}
await comandos[comando]();
