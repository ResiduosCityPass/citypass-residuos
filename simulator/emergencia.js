/**
 * Simula la resolucion de una emergencia (CU-01 de Emergencias, alternativa A7).
 *
 * Le manda a Residuos, por el webhook, lo mismo que mandaria el gateway del
 * Squad 1 cuando Emergencias resuelve un incidente. Sirve para mostrar en vivo
 * que Residuos actua cuando la causa es RESIDUOS y no hace nada cuando es VIA.
 *
 * Uso:
 *   GATEWAY_WEBHOOK_TOKEN=<token> npm run emergencia-residuos
 *   GATEWAY_WEBHOOK_TOKEN=<token> npm run emergencia-via
 *   node emergencia.js --causa RESIDUOS --lat -34.6118 --lng -58.396 --id EMG-20261008-0091
 *
 * Cada corrida usa un eventId nuevo: reenviar el MISMO evento no hace nada (la
 * deduplicacion es por eventId), y reenviar la misma emergencia en un evento
 * distinto tampoco duplica la intervencion (es unica por emergenciaId).
 */
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = process.env.GATEWAY_WEBHOOK_TOKEN;

function argumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : process.argv[i + 1];
}

if (!TOKEN) {
  console.error('Falta GATEWAY_WEBHOOK_TOKEN (el mismo que usa el backend).');
  process.exit(1);
}

// Por defecto, el Obelisco: donde estan los contenedores del seed.
const causa = argumento('causa', 'RESIDUOS').toUpperCase();
const lat = Number(argumento('lat', '-34.6037'));
const lng = Number(argumento('lng', '-58.3816'));
const emergenciaId = argumento('id', `EMG-${Date.now()}`);
const tipo = argumento('tipo', 'EmergenciaResuelta');

const sobre = {
  metadata: { eventId: randomUUID(), eventType: `com.citypass.emergencias.${tipo}` },
  data: {
    emergenciaId,
    estadoNuevo: 'RESUELTA',
    resultado: 'ATENDIDA',
    ubicacion: { lat, lng },
    causasRelacionadas: causa === 'NINGUNA' ? [] : [causa],
  },
};

const respuesta = await fetch(`${API}/webhooks/citypass?token=${encodeURIComponent(TOKEN)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(sobre),
});

console.log(
  `${tipo} ${emergenciaId} causa=${causa} -> HTTP ${respuesta.status}` +
    (respuesta.status === 204 ? ' (procesado)' : ` ${await respuesta.text()}`),
);
