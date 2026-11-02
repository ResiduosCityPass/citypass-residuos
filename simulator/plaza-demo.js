/**
 * Crea los contenedores de la plaza de la demo del squad 3 (Plaza Houssay).
 *
 * El seed los reparte alrededor del Obelisco y ninguno cae a menos de 300 m de la
 * plaza: sin esto, `ActividadCreada` no genera refuerzo ni `RefuerzoProgramado`.
 * Crea uno de cada tipo, asi la escuadrilla tiene algo que levantar con cualquier camion.
 * No les da sensor: quedan en 0 %, y la demo muestra que entran a la ruta igual.
 *
 * Se corre una sola vez por base. Requiere un token de administrador:
 *   cd ../backend && npm run token:dev -- ADMINISTRADOR
 *
 * Uso:
 *   TOKEN=<jwt> npm run plaza
 *   API_URL=<api-de-render>/api/v1 TOKEN=<jwt> npm run plaza
 */
const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error('Falta la variable TOKEN. Generala con:');
  console.error('  cd ../backend && npm run token:dev -- ADMINISTRADOR');
  process.exit(1);
}

// A menos de 100 m del punto que Espacios publica para la plaza (-34.5994, -58.3988).
const CONTENEDORES = [
  { tipoResiduo: 'COMUN', lat: -34.5991, lng: -58.3985 },
  { tipoResiduo: 'RECICLABLE', lat: -34.5997, lng: -58.3985 },
  { tipoResiduo: 'ORGANICO', lat: -34.5994, lng: -58.3993 },
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
    nombre: `Plaza Houssay ${Date.now()}`,
    umbralCriticoPct: 70,
    umbralTemperaturaC: 60,
  });

  for (const contenedor of CONTENEDORES) {
    const creado = await pedir('/contenedores', {
      ...contenedor,
      zonaId: zona.id,
      capacidadLitros: 1100,
    });
    console.log(`  ${creado.codigo} ${contenedor.tipoResiduo} en Plaza Houssay`);
  }

  console.log(`\nListo: ${CONTENEDORES.length} contenedores en la zona ${zona.nombre}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
