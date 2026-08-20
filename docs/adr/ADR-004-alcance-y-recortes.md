# ADR-004 — Alcance funcional y recortes deliberados

- **Estado:** Aceptado
- **Fecha:** 2026-08-20
- **Decisores:** Squad 4

## Contexto

El relevamiento inicial produjo 11 casos de uso, validados por la cátedra. La indicación recibida
fue **priorizar los que están más cerca del corazón del módulo** y ser realistas con la capacidad
del equipo: seis personas con roles diferenciados, sobre siete sprints en paralelo a la cursada.

Tres de esos casos de uso, tal como están redactados, son desproporcionadamente caros frente a lo
que aportan a la rúbrica.

## Opciones consideradas

### A. Implementar los 11 casos de uso con su alcance completo
- **En contra:** CU-08 tal como está redactado es un *Vehicle Routing Problem con restricción de
  capacidad*, que es NP-hard. CU-10 pide funcionamiento offline con sincronización posterior.
  CU-02 pide dibujo de polígonos sobre mapa. Cualquiera de los tres puede consumir un sprint entero
  y ninguno aporta puntaje adicional respecto de su versión recortada.

### B. Descartar los casos de uso caros
- **En contra:** CU-08 es literalmente el corazón del módulo según el relevamiento, y es donde
  naturalmente vive el componente de IA/ML que exige la dimensión 8.

### C. Recortar el alcance de cada caso caro conservando su valor demostrable  (elegida)

## Decisión

Se aplican cuatro cambios explícitos de alcance:

| CU | Alcance original | Alcance implementado | Justificación |
|---|---|---|---|
| CU-02 | Dibujar polígonos de barrios sobre el mapa | Zona como entidad (`nombre`, `umbralCritico`), contenedor con FK a zona | La regla de negocio que consume CU-05 es idéntica. El polígono es presentación, no dominio. |
| CU-08 | Ruteo óptimo con capacidad y zonas bloqueadas | Heurística *nearest-neighbor* respetando capacidad de carga | Explicable, determinista y testeable. La optimalidad no se evalúa; la existencia del caso de uso sí. |
| CU-10 | Confirmación con soporte offline y sincronización posterior | Confirmación online con validación de GPS por radio | Es el ítem más caro del relevamiento y ninguna dimensión de la rúbrica lo exige. |
| CU-12 | *(no existía)* | **Predecir saturación de contenedor** — regresión lineal sobre el histórico de lecturas | Se agrega. Cubre la dimensión 8 (IA/ML) de forma independiente de CU-08. |

El agregado de CU-12 es la contrapartida del recorte de CU-08: **desacopla la nota de IA/ML del
caso de uso más riesgoso del proyecto.** Si CU-08 se complica, la dimensión 8 sigue cubierta.

## Consecuencias

- Los alcances completos quedan registrados como Tier 3 en el
  [backlog priorizado](../sprints/backlog-priorizado.md). Son recortes, no omisiones, y se presentan
  como tales ante la cátedra.
- El modelo de datos deja preparado el terreno para los alcances completos: `Zona` puede recibir una
  columna `geometry` sin migrar datos, y `Parada` ya contempla `confirmadaEn` para una futura cola
  offline.
- La heurística de CU-08 se implementa detrás de una interfaz `RoutePlanner`, de modo que
  sustituirla por una optimización real en el Sprint 6 no requiera tocar el caso de uso.
