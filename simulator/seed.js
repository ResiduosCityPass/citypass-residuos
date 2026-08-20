/**
 * Prepara el escenario de demo: crea una zona, N contenedores y sus sensores,
 * y guarda las API keys en sensores.json para que el simulador las use.
 *
 * Requiere un token de administrador:
 *   cd ../backend && npm run token:dev -- ADMINISTRADOR
 *
 * Uso:
 *   TOKEN=<jwt> npm run seed
 */
import { writeFileSync } from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = process.env.TOKEN;
const CANTIDAD = Number(process.env.CANTIDAD ?? 8);

if (!TOKEN) {
  console.error('Falta la variable TOKEN. Generala con:');
  console.error('  cd ../backend && npm run token:dev -- ADMINISTRADOR');
  process.exit(1);
}

// Coordenadas alrededor del Obelisco, para que el mapa tenga algo reconocible.
const CENTRO = { lat: -34.6037, lng: -58.3816 };
const TIPOS = ['COMUN', 'RECICLABLE', 'ORGANICO'];

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  const texto = await respuesta.text();

  if (!respuesta.ok) {
    throw new Error(`${metodo} ${ruta} -> ${respuesta.status} ${texto}`);
  }

  return texto ? JSON.parse(texto) : null;
}

async function main() {
  console.log(`Sembrando contra ${API}`);

  const zona = await pedir('POST', '/zonas', {
    nombre: `Centro ${Date.now()}`,
    umbralCriticoPct: 70,
    umbralTemperaturaC: 60,
  });
  console.log(`  zona ${zona.nombre} (umbral ${zona.umbralCriticoPct}%)`);

  const sensores = [];

  for (let i = 0; i < CANTIDAD; i++) {
    const contenedor = await pedir('POST', '/contenedores', {
      zonaId: zona.id,
      tipoResiduo: TIPOS[i % TIPOS.length],
      capacidadLitros: 1100,
      lat: Number((CENTRO.lat + (Math.random() - 0.5) * 0.02).toFixed(6)),
      lng: Number((CENTRO.lng + (Math.random() - 0.5) * 0.02).toFixed(6)),
    });

    const sensor = await pedir('POST', `/contenedores/${contenedor.id}/sensor`, {});

    sensores.push({
      contenedorCodigo: contenedor.codigo,
      sensorCodigo: sensor.codigo,
      apiKey: sensor.apiKey,
      // Arranca cada contenedor en un punto distinto de llenado para que la
      // demo no los vea cruzar el umbral a todos al mismo tiempo.
      nivelInicial: Number((Math.random() * 40).toFixed(2)),
    });

    console.log(`  ${contenedor.codigo} <- ${sensor.codigo}`);
  }

  writeFileSync('sensores.json', JSON.stringify({ zonaId: zona.id, sensores }, null, 2));
  console.log(`\nListo: ${sensores.length} sensores en sensores.json`);
  console.log('Ahora corre:  npm start');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
