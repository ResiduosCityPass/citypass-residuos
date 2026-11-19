# Evaluación de la predicción de saturación (CU-12)

CU-12 estima cuántas horas faltan para que un contenedor cruce el umbral de su zona. Ajusta una
regresión lineal sobre las lecturas del ciclo de llenado actual
([`regresion-lineal.ts`](../../backend/src/modules/prediccion/domain/reglas/regresion-lineal.ts)).
Este documento mide cuánto se equivoca esa estimación y si conviene frente a algo más simple.

## Cómo se evalúa

```bash
cd backend && npm run prediccion:evaluar
```

El código está en
[`evaluacion.ts`](../../backend/src/modules/prediccion/domain/evaluacion.ts) y lo cubre su
`evaluacion.spec.ts`.

- **Datos separados en el tiempo.** Para cada ciclo de llenado se corta después de cada lectura,
  a partir de la tercera, que es el mínimo que exige la regresión. El estimador solo ve las
  lecturas hasta el corte. Su predicción se compara con el momento real en que el nivel cruza el
  umbral, que está en el futuro de ese corte. Nunca se entrena con datos posteriores a la
  predicción.
- **Datos sintéticos y reproducibles.** Son 200 ciclos por escenario, con nivel inicial entre 0 y
  40%, umbral de 70% (el del seed de la demo) y una lectura cada 15 minutos (CU-04). La semilla es
  fija, así que dos corridas dan exactamente lo mismo. No se lee la base de producción.
- **Tres escenarios:**
  - **simulador:** el mismo ritmo que `simulator/simulador.js`, que sube entre 0,5 y 3 puntos por
    lectura.
  - **ritmo-diario:** el llenado depende de la hora. Es casi nulo de madrugada y el doble a la
    tarde.
  - **sensor-ruidoso:** como el simulador, pero cada lectura tiene un error de hasta ±4 puntos.
    Es una hipótesis del escenario sintético para ver cómo responde cada estimador al ruido, no
    una medición de un sensor real. Validar con datos reales queda como mejora futura.
- **Dos estimaciones sencillas para comparar:**
  - **último tramo:** el ritmo entre las dos últimas lecturas.
  - **primera y última:** el ritmo promedio entre la primera y la última lectura del ciclo.

### Métricas

| Métrica | Qué mide |
|---|---|
| Cobertura | Porcentaje de cortes en los que el estimador dio una predicción. No la da si la tendencia no es creciente |
| MAE | Error absoluto medio, en horas |
| RMSE | Raíz del error cuadrático medio, en horas. Castiga los errores grandes |
| Error ≤ 1 h | Porcentaje de predicciones que erraron por una hora o menos |
| MAE últimas 6 h | MAE solo de los cortes a 6 h o menos del cruce real. Es el horizonte en el que se decide si el camión pasa hoy |

## Resultados (semilla 2026, 18/11/2026)

### simulador

| Estimador | Cortes | Cobertura | MAE (h) | RMSE (h) | Error ≤ 1 h | MAE últimas 6 h |
|---|---|---|---|---|---|---|
| **regresión (CU-12)** | 5448 | 100,0% | **0,62** | 1,14 | 83,1% | 0,44 |
| último tramo | 5448 | 100,0% | 1,92 | 3,36 | 51,2% | 1,49 |
| primera y última | 5448 | 100,0% | 0,60 | 1,11 | 83,7% | 0,42 |

### ritmo-diario

| Estimador | Cortes | Cobertura | MAE (h) | RMSE (h) | Error ≤ 1 h | MAE últimas 6 h |
|---|---|---|---|---|---|---|
| **regresión (CU-12)** | 5892 | 99,9% | **8,84** | 18,10 | 27,7% | 4,68 |
| último tramo | 5892 | 95,2% | 14,73 | 112,93 | 45,7% | 3,74 |
| primera y última | 5892 | 99,9% | 8,11 | 17,13 | 29,1% | 4,01 |

### sensor-ruidoso

| Estimador | Cortes | Cobertura | MAE (h) | RMSE (h) | Error ≤ 1 h | MAE últimas 6 h |
|---|---|---|---|---|---|---|
| **regresión (CU-12)** | 5539 | 99,3% | **1,97** | 27,02 | **71,5%** | **0,89** |
| último tramo | 5539 | 68,9% | 31,31 | 1409,78 | 31,8% | 6,80 |
| primera y última | 5539 | 99,2% | 1,77 | 10,79 | 66,9% | 1,01 |

## Conclusiones

1. **La regresión es mucho mejor que mirar solo el último tramo.** En los tres escenarios tiene
   menos error: un tercio con el ritmo del simulador y dieciséis veces menos con un sensor
   ruidoso. Además da predicción en casi todos los cortes. El último tramo, en cambio, deja de
   predecir en un tercio de los casos cuando el sensor tiene error.
2. **Frente al ritmo promedio (primera y última), la regresión empata.** Con un llenado de ritmo
   constante, las dos estiman lo mismo y la diferencia es de centésimas de hora. Con un sensor
   ruidoso, la regresión acierta más donde importa: más predicciones con error de una hora o
   menos (71,5% contra 66,9%) y menos error en las últimas 6 h (0,89 h contra 1,01 h). La razón
   es que usa todas las lecturas, mientras que el ritmo promedio depende de solo dos, y un error
   del sensor en cualquiera de ellas mueve la predicción. En el promedio de todo el ciclo
   (MAE y RMSE), en cambio, gana el ritmo promedio.
3. **La regresión además entrega un R².** Mide qué tan bien la recta ajusta a las lecturas que
   ya hay, no una confianza calibrada sobre la predicción futura: un R² alto no garantiza que el
   ritmo se mantenga. Igual sirve como alarma: la tarjeta de CU-12 avisa *"no planifiques con
   este número"* por debajo de 0,5. El ritmo promedio no tiene una medida equivalente.
4. **Límite conocido: el ritmo que cambia con la hora.** Si un contenedor se llena distinto de día
   que de noche, todos los estimadores se equivocan entre 4 y 9 horas, porque suponen un ritmo
   constante. La mejora sería estimar un ritmo por franja horaria a partir del histórico. Eso
   necesita varios días de lecturas reales por contenedor, y hoy solo hay datos del simulador, que
   llena a ritmo constante. Queda fuera del alcance (ver
   [ADR-004](../adr/ADR-004-alcance-y-recortes.md)).
5. **Las primeras lecturas del ciclo son poco confiables.** Con un sensor ruidoso, el RMSE alto de
   la regresión viene de los cortes con 3 o 4 lecturas, menos de una hora de datos. Ahí, una
   pendiente casi plana por el error del sensor da predicciones de cientos de horas. Separando por
   cantidad de lecturas:

   | Estimador | RMSE con 3 o 4 lecturas | RMSE con 5 o más lecturas |
   |---|---|---|
   | regresión (CU-12) | 102,70 h | **5,29 h** |
   | primera y última | 33,32 h | 6,78 h |

   Con al menos 5 lecturas (una hora), la regresión tiene menos RMSE que el ritmo promedio. Una
   mejora barata sería no predecir con menos de una hora de datos en el ciclo. No se aplica en
   esta entrega porque cambia lo que ve el operador.

**Decisión:** se mantiene la regresión lineal de CU-12. Le gana con claridad a la estimación
ingenua y empata con el ritmo promedio cuando el llenado es parejo. Con el error de sensor que
supone el escenario ruidoso, es más precisa cerca del umbral y, desde la primera hora de datos,
también en general. Además informa con su R² qué tan bien ajusta a las lecturas. Falta validarla
con lecturas de sensores reales.
