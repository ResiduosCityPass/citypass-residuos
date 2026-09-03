/**
 * Simulador de sensores IoT (CU-04).
 *
 * Cada sensor reporta nivel, temperatura y bateria contra POST /lecturas usando
 * su propia API key. El nivel crece de forma monotona con ruido: esa monotonia
 * es lo que le da algo que predecir a la regresion lineal de CU-12.
 *
 * Escenarios, todos sobre UN contenedor objetivo:
 *   normal        llenado gradual de todos los contenedores
 *   saturacion    fuerza al objetivo por encima del umbral  -> dispara CU-05
 *   incendio      dispara la temperatura del objetivo       -> dispara CU-06
 *   bateria       descarga el sensor del objetivo
 *
 * Los escenarios importan para la demo: hay que poder provocar un incendio a
 * voluntad para mostrar la integracion con Emergencias. Esperar a que ocurra
 * por azar no es una opcion.
 *
 * **El objetivo se elige con `--contenedor`**, y por defecto es el primero.
 * Sin esto los dos escenarios de la demo caian sobre el mismo contenedor: el
 * que acababa de ponerse rojo por saturacion era el mismo que despues se
 * prendia fuego, y el remate —un contenedor VERDE con una alerta de incendio,
 * que es lo que prueba que las dos reglas son independientes— no se podia
 * mostrar.
 *
 * **El nivel de cada sensor sobrevive entre corridas** (`estado.json`). Antes
 * cada arranque volvia al `nivelInicial`, asi que encadenar dos escenarios
 * hacia que el contenedor recien saturado reportara su nivel viejo y volviera
 * a verde solo, en vivo y sin que nadie lo vaciara. Con `--reiniciar` se
 * arranca de cero a proposito.
 *
 * Uso:
 *   npm start
 *   npm run incendio
 *   node simulador.js --escenario saturacion --intervalo 2
 *   node simulador.js --escenario incendio --contenedor CT-0007
 *   node simulador.js --reiniciar
 */
import { readFileSync, writeFileSync } from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';

/** Donde se guarda el nivel de cada sensor entre corridas. No se versiona. */
const ARCHIVO_ESTADO = 'estado.json';

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const ESCENARIO = leerArgumento('escenario', 'normal');
const INTERVALO_SEG = Number(leerArgumento('intervalo', 5));
const OBJETIVO = leerArgumento('contenedor', null);
const REINICIAR = process.argv.includes('--reiniciar');

let config;
try {
  config = JSON.parse(readFileSync('sensores.json', 'utf8'));
} catch {
  console.error('No encuentro sensores.json. Corre primero:  TOKEN=<jwt> npm run seed');
  process.exit(1);
}

/**
 * Lo que quedo de la corrida anterior, por codigo de contenedor.
 *
 * Sin esto cada arranque volvia al `nivelInicial` del seed, y encadenar dos
 * escenarios —que es exactamente lo que hace la demo— mostraba al contenedor
 * recien saturado reportando su nivel viejo y volviendo a verde solo, sin que
 * nadie lo vaciara. En vivo eso se lee como un bug.
 */
function estadoGuardado() {
  if (REINICIAR) return {};
  try {
    return JSON.parse(readFileSync(ARCHIVO_ESTADO, 'utf8'));
  } catch {
    return {};
  }
}

const previo = estadoGuardado();

const estado = config.sensores.map((s) => {
  const guardado = previo[s.contenedorCodigo];
  return {
    ...s,
    nivel: guardado?.nivel ?? s.nivelInicial,
    temperatura: guardado?.temperatura ?? 20 + Math.random() * 6,
    bateria: guardado?.bateria ?? 100,
  };
});

/**
 * A quien le pega el escenario.
 *
 * Por defecto el primero, como antes. Pero si los dos escenarios de la demo
 * caen sobre el mismo contenedor, el de saturacion se come al de incendio: el
 * remate es un contenedor VERDE prendido fuego, y no puede estar verde si lo
 * acabas de saturar. `--contenedor CT-0007` los separa.
 */
const CODIGO_OBJETIVO = OBJETIVO ?? config.sensores[0]?.contenedorCodigo;

if (OBJETIVO && !config.sensores.some((s) => s.contenedorCodigo === OBJETIVO)) {
  console.error(
    `No hay ningun sensor para ${OBJETIVO}. Los que hay: ` +
      config.sensores.map((s) => s.contenedorCodigo).join(', '),
  );
  process.exit(1);
}

function aplicarEscenario(sensor, esElObjetivo) {
  if (!esElObjetivo || ESCENARIO === 'normal') return;

  if (ESCENARIO === 'saturacion') sensor.nivel = Math.min(100, Math.max(sensor.nivel, 72) + 4);
  if (ESCENARIO === 'incendio') sensor.temperatura = 65 + Math.random() * 25;
  if (ESCENARIO === 'bateria') sensor.bateria = Math.max(0, Math.min(sensor.bateria, 18) - 2);
}

function avanzar(sensor, esElObjetivo) {
  // Crecimiento monotono con ruido: entre 0.5% y 3% por ciclo.
  sensor.nivel = Math.min(100, sensor.nivel + 0.5 + Math.random() * 2.5);
  sensor.temperatura += (Math.random() - 0.5) * 1.5;
  sensor.bateria = Math.max(0, sensor.bateria - Math.random() * 0.3);

  aplicarEscenario(sensor, esElObjetivo);
}

/** Se guarda despues de cada ciclo: un Ctrl+C no puede perder el nivel. */
function guardarEstado() {
  const porCodigo = {};
  for (const s of estado) {
    porCodigo[s.contenedorCodigo] = {
      nivel: s.nivel,
      temperatura: s.temperatura,
      bateria: s.bateria,
    };
  }
  writeFileSync(ARCHIVO_ESTADO, JSON.stringify(porCodigo, null, 2));
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

  for (const sensor of estado) {
    avanzar(sensor, sensor.contenedorCodigo === CODIGO_OBJETIVO);
    await reportar(sensor);
  }

  guardarEstado();
}

const recuperados = Object.keys(previo).length;

console.log(`Simulador contra ${API}`);
console.log(
  `${estado.length} sensores · escenario "${ESCENARIO}" sobre ${CODIGO_OBJETIVO} · cada ${INTERVALO_SEG}s`,
);
console.log(
  recuperados
    ? `Niveles recuperados de ${ARCHIVO_ESTADO} (${recuperados} sensores). --reiniciar para empezar de cero.`
    : `Arrancando desde los niveles del seed.`,
);
console.log('Ctrl+C para cortar.');

await ciclo();
setInterval(() => void ciclo(), INTERVALO_SEG * 1000);
