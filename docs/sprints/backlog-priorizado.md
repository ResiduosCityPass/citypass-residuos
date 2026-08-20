# Backlog priorizado — Squad 4 · Gestión de Residuos Inteligente

> Criterio de priorización: cada caso de uso se evalúa cruzando **peso en la rúbrica de evaluación**
> contra **costo de implementación**. Se construye primero el camino crítico del dominio
> (sensor → lectura → regla → evento) y se recortan deliberadamente las funcionalidades caras
> que no suman puntaje. Los recortes están documentados en
> [ADR-004](../adr/ADR-004-alcance-y-recortes.md), no son omisiones.

## Restricción de cronograma que condiciona todo

El **Hito 1 (24/09)** pide textualmente *"Módulo funcional **sin integración**"*. Hasta esa fecha
no dependemos del bus de eventos del Squad 1 ni del login federado del Squad 2. Esto permite
construir los sprints 1 y 2 en total autonomía, siempre que la publicación de eventos quede
detrás de una abstracción intercambiable (ver [ADR-003](../adr/ADR-003-integracion-event-bus.md)).

| Instancia | Fecha | Qué se entrega |
|---|---|---|
| Sprint 0 | 06/08 – 27/08 | Squad, stack, repo, board, CI/CD |
| Sprint 1 | 28/08 – 10/09 | Tier 1 backend + modelo de datos + APIs |
| Sprint 2 | 11/09 – 23/09 | Tier 1 completo + testing 60% |
| **Hito 1** | **24/09 – 01/10** | **Módulo funcional sin integración + UML + evidencia** |
| Sprint 3 | 02/10 – 15/10 | Casos de uso transversales, chapters técnicos |
| Sprint 4 | 16/10 – 29/10 | Tier 2 + integración real de eventos entre squads |
| Sprint 5 | 30/10 – 12/11 | Tier 3 + tests de integración |
| Sprint 6 | 13/11 – 18/11 | Revisión de arquitectura, documentación final |
| **Hito 2** | **19/11 – 26/11** | **Módulo integrado + demo unificada** |

---

## Tier 1 — Núcleo del módulo · Sprints 1-2 · entra al Hito 1

Sin estos seis casos de uso no hay módulo. Todos son de costo bajo o medio.

| CU | Nombre | Costo | Por qué es prioritario |
|---|---|---|---|
| CU-01 | Registrar contenedor y sensor | Muy bajo | CRUD fundacional. Toda entidad del dominio cuelga de acá. |
| CU-02 | Definir zonas y umbrales | Bajo* | Habilita la regla de negocio de CU-05. *Recortado: sin polígonos. |
| CU-04 | Reportar nivel de llenado | Bajo | `POST /lecturas`. Es el disparador de todo el dominio. Se alimenta con el simulador. |
| CU-05 | Detectar contenedor crítico | Bajo-medio | Regla + transición de estado + **publicación de evento**. Es la evidencia de EDA (dim. 5, 10 pts). |
| CU-06 | Detectar riesgo de incendio | Muy bajo | **Mejor relación valor/costo del backlog.** Reutiliza el motor de reglas de CU-05 cambiando la variable evaluada. Genera el evento crítico que consume Emergencias (Squad 6). |
| CU-07 | Ver mapa en tiempo real | Medio | Cubre casi por completo la dim. 9 (UX/UI, 10 pts) y es lo que se muestra en la demo final. |

**Definición de terminado del Tier 1:** un sensor simulado publica lecturas cada N segundos, el
backend las valida y persiste, evalúa el umbral de la zona, transiciona el contenedor a estado
crítico sin duplicar alertas, emite el evento correspondiente, y el mapa refleja el cambio de color.

---

## Tier 2 — Cierre del ciclo de negocio · Sprints 2-4

| CU | Nombre | Costo | Recorte aplicado |
|---|---|---|---|
| CU-12 | **Predecir saturación de contenedor** *(nuevo)* | Bajo | Regresión lineal sobre el histórico de lecturas → horas estimadas hasta alcanzar el umbral. **Cubre por sí solo la dim. 8 (IA/ML, 10 pts)** a una fracción del costo de CU-08. |
| CU-03 | Gestionar flota | Bajo | CRUD. Solo aporta valor si se implementa CU-09. |
| CU-10 | Confirmar vaciado | Bajo | **Sin soporte offline.** `PATCH /paradas/{id}` + validación de GPS por radio. Cierra el ciclo rojo → verde y emite evento. |
| CU-11 | Consultar contenedores cercanos | Bajo | Fórmula de Haversine sobre lat/lng. Aporta la vista "ciudadano" para la demo. |
| CU-08 | Generar ruta óptima *(versión heurística)* | Medio | **Nearest-neighbor con restricción de capacidad**, no optimización exacta. Explicable y suficiente. |
| CU-09 | Asignar ruta a camión y chofer | Medio | Depende de CU-08. El operador confirma o ajusta la propuesta. |

---

## Tier 3 — Solo si sobra tiempo · Sprints 5-6

| Ítem | Por qué queda al final |
|---|---|
| CU-02 con polígonos reales dibujables sobre el mapa | Requiere PostGIS y edición geoespacial en el frontend. La versión con zona como entidad simple cubre la misma regla de negocio. |
| CU-10 con sincronización offline | Cola local, resolución de conflictos y reconciliación. Es el ítem más caro del documento y ninguna dimensión de la rúbrica lo exige. |
| CU-08 con optimización real (2-opt / OR-Tools) | Es un VRP con capacidad, NP-hard. La heurística greedy ya demuestra el caso de uso. |
| Modelo predictivo avanzado (series temporales, estacionalidad) | La regresión lineal de CU-12 ya satisface la dimensión de IA/ML. |

---

## Mapa de cobertura de la rúbrica

| # | Dimensión | Pts | Cubierta por |
|---|---|---|---|
| 1 | Diseño de arquitectura | 10 | Modularidad de NestJS, capas domain/application/infrastructure, ADRs |
| 2 | Modelado y diagramas | 10 | UML (CU, ER, secuencia) + C4 en `docs/arquitectura/` |
| 3 | Seguridad e identidad | 10 | Guards JWT + roles, integración con Squad 2 (Adriel) |
| 4 | Integración y APIs | 10 | REST + Swagger + filtro global de excepciones |
| 5 | Event Driven Architecture | 10 | **CU-05, CU-06, CU-10** publican; suscripción a Emergencias y Reclamos |
| 6 | Testing | 10 | Jest unitario + e2e, umbral de cobertura 60% forzado en CI |
| 7 | DevOps & Cloud | 10 | GitHub Actions + Docker (Ramiro) |
| 8 | IA / ML / I+D | 10 | **CU-12** (predicción) + heurística de ruteo de CU-08 |
| 9 | UX/UI | 10 | **CU-07** (mapa) + CU-11 (Máximo) |
| 10 | Equipo y SCRUM | 10 | Board, roles asignados, retros por sprint (Tomás) |

## Riesgos identificados

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El Squad 1 define el contrato del bus tarde o lo cambia | Alto | Publicar detrás de la interfaz `EventPublisher`. La implementación se cambia sin tocar el dominio. |
| El Squad 2 no tiene el JWT listo para Sprint 3 | Medio | Guard con clave de firma configurable y perfil `dev` que acepta tokens locales. |
| CU-08 se lleva puesto el sprint | Alto | Está en Tier 2 y en versión heurística. CU-12 cubre la dimensión de IA/ML de forma independiente. |
| Cobertura de tests por debajo del 60% al llegar al Hito 1 | Alto | El umbral se fuerza en CI desde el Sprint 1: si baja del 60%, el build falla. |
