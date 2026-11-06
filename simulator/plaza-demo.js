/**
 * Crea los contenedores de la sede de la demo del squad 3.
 *
 * El seed los reparte alrededor del Obelisco y ninguno cae a menos de 300 m de las
 * sedes de Espacios: sin esto, `ActividadCreada` no genera refuerzo ni `RefuerzoProgramado`.
 * Crea uno de cada tipo, asi la escuadrilla tiene algo que levantar con cualquier camion.
 * No les da sensor: quedan en 0 %, y la demo muestra que entran a la ruta igual.
 *
 * Se corre una sola vez por base: la segunda vez la zona ya existe y falla sin
 * crear nada. Requiere un token de administrador:
 *   cd ../backend && npm run token:dev -- ADMINISTRADOR
 *
 * Uso:
 *   TOKEN=<jwt> npm run plaza
 *   TOKEN=<jwt> npm run plaza -- --nombre "Sede Recoleta" --lat <lat> --lng <lng>
 *   API_URL=<api-de-render>/api/v1 TOKEN=<jwt> npm run plaza -- ...
 *
 * Sin --lat y --lng usa Plaza Houssay (-34.5994, -58.3988). Las coordenadas tienen
 * que ser las mismas que Espacios publica en `ubicacion` para la sede.
 */
const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error('Falta la variable TOKEN. Generala con:');
  console.error('  cd ../backend && npm run token:dev -- ADMINISTRADOR');
  process.exit(1);
}

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const NOMBRE = leerArgumento('nombre', 'Plaza Houssay');
const LAT = Number(leerArgumento('lat', -34.5994));
const LNG = Number(leerArgumento('lng', -58.3988));

if (!Number.isFinite(LAT) || !Number.isFinite(LNG)) {
  console.error('--lat y --lng tienen que ser numeros.');
  process.exit(1);
}

// A menos de 100 m del punto de la sede: uno de cada tipo.
const CONTENEDORES = [
  { tipoResiduo: 'COMUN', lat: LAT + 0.0003, lng: LNG + 0.0003 },
  { tipoResiduo: 'RECICLABLE', lat: LAT - 0.0003, lng: LNG + 0.0003 },
  { tipoResiduo: 'ORGANICO', lat: LAT, lng: LNG - 0.0005 },
];

async function pedir(ruta, cuerpo) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(cuerpo),
  });

  const texto = await respuesta.text();

  if (!respuesta.ok) {
    throw new Error(`POST ${ruta} -> ${respuesta.status} ${texto}`);
  }

  return JSON.parse(texto);
}

async function main() {
  const zona = await pedir('/zonas', {
    nombre: NOMBRE,
    umbralCriticoPct: 70,
    umbralTemperaturaC: 60,
  });

  for (const contenedor of CONTENEDORES) {
    const creado = await pedir('/contenedores', {
      ...contenedor,
      zonaId: zona.id,
      capacidadLitros: 1100,
    });
    console.log(`  ${creado.codigo} ${contenedor.tipoResiduo} en ${NOMBRE}`);
  }

  console.log(`\nListo: ${CONTENEDORES.length} contenedores en la zona ${zona.nombre}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
