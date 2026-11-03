/** Eventos climaticos sobre el backend real. No requiere EDA ni dependencias. */
const API = (process.env.API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
const TOKEN = process.env.TOKEN;
const [accion, referencia, descripcion = 'Inundacion simulada'] = process.argv.slice(2);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  if (!TOKEN) throw new Error('Falta TOKEN: usa un JWT de ADMINISTRADOR u OPERADOR del entorno local.');
  if (!['inicio', 'fin'].includes(accion) || !referencia) {
    throw new Error('Uso: npm run inundacion -- inicio <zonaId[,zonaId]> "Descripcion" | fin <inundacionId>');
  }
  const ids = referencia.split(',');
  if (!ids.every((id) => UUID.test(id)) || (accion === 'fin' && ids.length !== 1)) {
    throw new Error('Los identificadores deben ser UUID v4. Para finalizar usa el id de una inundacion.');
  }
  const path = accion === 'inicio' ? '/contingencias/simulador/inicio' : `/contingencias/simulador/${referencia}/finalizacion`;
  const respuesta = await fetch(`${API}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: accion === 'inicio' ? JSON.stringify({ descripcion, zonaIds: ids }) : undefined,
  });
  const contenido = await respuesta.json();
  if (!respuesta.ok) throw new Error(`${respuesta.status} ${contenido.code ?? ''}: ${contenido.message ?? 'No se pudo simular el evento'}`);
  console.log(JSON.stringify(contenido, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
