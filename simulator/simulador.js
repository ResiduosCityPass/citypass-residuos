/**
 * Simulador de sensores IoT (CU-04).
 *
 * Cada sensor reporta nivel, temperatura y bateria contra POST /lecturas usando
 * su propia API key. El nivel crece de forma monotona con ruido: esa monotonia
 * es lo que le da algo que predecir a la regresion lineal de CU-12.
 *
 * Escenarios:
 *   normal        llenado gradual de todos los contenedores
 *   saturacion    fuerza al primer contenedor por encima del umbral -> dispara CU-05
 *   incendio      dispara la temperatura del primer contenedor      -> dispara CU-06
 *   bateria       descarga el primer sensor
 *
 * Los escenarios importan para la demo: hay que poder provocar un incendio a
 * voluntad para mostrar la integracion con Emergencias. Esperar a que ocurra
 * por azar no es una opcion.
 *
 * Uso:
 *   npm start
 *   npm run incendio
 *   node simulador.js --escenario saturacion --intervalo 2
 */
import { readFileSync } from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const ESCENARIO = leerArgumento('escenario', 'normal');
const INTERVALO_SEG = Number(leerArgumento('intervalo', 5));

let config;
try {
  config = JSON.parse(readFileSync('sensores.json', 'utf8'));
} catch {
  console.error('No encuentro sensores.json. Corre primero:  TOKEN=<jwt> npm run seed');
  process.exit(1);
}

const estado = config.sensores.map((s) => ({
  ...s,
  nivel: s.nivelInicial,
  temperatura: 20 + Math.random() * 6,
  bateria: 100,
}));

/** El primer sensor es el que sufre el escenario elegido. */
function aplicarEscenario(sensor, esElPrimero) {
  if (!esElPrimero || ESCENARIO === 'normal') return;

  if (ESCENARIO === 'saturacion') sensor.nivel = Math.min(100, Math.max(sensor.nivel, 72) + 4);
  if (ESCENARIO === 'incendio') sensor.temperatura = 65 + Math.random() * 25;
  if (ESCENARIO === 'bateria') sensor.bateria = Math.max(0, Math.min(sensor.bateria, 18) - 2);
}

function avanzar(sensor, esElPrimero) {
  // Crecimiento monotono con ruido: entre 0.5% y 3% por ciclo.
  sensor.nivel = Math.min(100, sensor.nivel + 0.5 + Math.random() * 2.5);
  sensor.temperatura += (Math.random() - 0.5) * 1.5;
  sensor.bateria = Math.max(0, sensor.bateria - Math.random() * 0.3);

  aplicarEscenario(sensor, esElPrimero);
}

async function reportar(sensor) {
  const respuesta = await fetch(`${API}/lecturas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sensor-Key': sensor.apiKey,
    },
    body: JSON.stringify({
      nivelLlenadoPct: Number(sensor.nivel.toFixed(2)),
      temperaturaC: Number(sensor.temperatura.toFixed(2)),
      bateriaPct: Math.round(sensor.bateria),
      registradaEn: new Date().toISOString(),
    }),
  });

  if (!respuesta.ok) {
    console.log(`  ${sensor.contenedorCodigo}  ERROR ${respuesta.status} ${await respuesta.text()}`);
    return;
  }

  const r = await respuesta.json();
  const transicion = r.estadoAnterior === r.estadoNuevo ? '' : ` ${r.estadoAnterior} -> ${r.estadoNuevo}`;
  const alertas = r.alertasGeneradas.length ? `  ALERTAS: ${r.alertasGeneradas.join(', ')}` : '';

  console.log(
    `  ${sensor.contenedorCodigo}  ${sensor.nivel.toFixed(1).padStart(5)}%  ` +
      `${sensor.temperatura.toFixed(1).padStart(5)}C  bat ${Math.round(sensor.bateria)}%` +
      `${transicion}${alertas}`,
  );
}

async function ciclo() {
  console.log(`\n[${new Date().toLocaleTimeString()}] escenario: ${ESCENARIO}`);

  for (const [i, sensor] of estado.entries()) {
    avanzar(sensor, i === 0);
    await reportar(sensor);
  }
}

console.log(`Simulador contra ${API}`);
console.log(`${estado.length} sensores · escenario "${ESCENARIO}" · cada ${INTERVALO_SEG}s`);
console.log('Ctrl+C para cortar.');

await ciclo();
setInterval(() => void ciclo(), INTERVALO_SEG * 1000);
