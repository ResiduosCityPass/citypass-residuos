/**
 * Evalua la prediccion de CU-12 contra dos estimaciones sencillas.
 *
 *   npm run prediccion:evaluar
 *
 * Imprime una tabla en Markdown por escenario. Los datos son sinteticos y con
 * semilla fija: dos corridas dan exactamente el mismo resultado. Resultados y
 * conclusiones en docs/arquitectura/evaluacion-prediccion.md.
 */
import {
  ESCENARIOS,
  ESTIMADORES,
  evaluar,
  generarCiclos,
} from '../modules/prediccion/domain/evaluacion';

const UMBRAL_PCT = 70;
const CONTENEDORES = 200;
const SEMILLA = 2026;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const horas = (x: number) => x.toFixed(2);

console.log(
  `Umbral ${UMBRAL_PCT}% · ${CONTENEDORES} ciclos de llenado por escenario · semilla ${SEMILLA}\n`,
);

for (const escenario of ESCENARIOS) {
  const ciclos = generarCiclos(escenario, CONTENEDORES, UMBRAL_PCT, SEMILLA);

  console.log(`### ${escenario.nombre}\n\n${escenario.descripcion}.\n`);
  console.log(
    '| Estimador | Cortes | Cobertura | MAE (h) | RMSE (h) | Error ≤ 1 h | MAE últimas 6 h |',
  );
  console.log('|---|---|---|---|---|---|---|');

  for (const [nombre, estimador] of Object.entries(ESTIMADORES)) {
    const e = evaluar(ciclos, UMBRAL_PCT, estimador);
    console.log(
      `| ${nombre} | ${e.cortes} | ${pct(e.cobertura)} | ${horas(e.mae)} | ${horas(e.rmse)} | ` +
        `${pct(e.dentroDeUnaHora)} | ${horas(e.maeUltimas6h)} |`,
    );
  }

  console.log('');
}
