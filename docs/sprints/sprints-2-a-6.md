# Sprints 2 a 6 — cierres reconstruidos · 11/09 – 18/11

> **Cómo se armó este documento.** Los cierres de los sprints 2 a 6 no se escribieron en su
> momento. Este documento los reconstruye el 19/11 a partir del historial de GitHub: los PRs
> mergeados a `develop` en cada rango de fechas y los releases a `main`. Solo lista lo que quedó
> registrado. Las retrospectivas las completó el equipo, con Tomás (Scrum Master) como facilitador.
>
> El nombre y el objetivo de cada sprint son los de la planificación de la cátedra (presentación
> de la materia, clase del 06/08).
>
> Los sprints anteriores están en [Sprint 0](sprint-0.md) y [Sprint 1](sprint-1.md).

## Resumen

PRs mergeados a `develop` por sprint e integrante:

| Sprint | Fechas | Nicolás | Tomás | Máximo | Francisco | Ramiro | Adriel | Total | Releases a `main` |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 11/09 – 23/09 | 0 | 0 | 10 | 9 | 2 | 1 | 22 | #16, #29, #33, #32, #38, #43 |
| Hito 1 | 24/09 – 01/10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| 3 | 02/10 – 15/10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| 4 | 16/10 – 29/10 | 1 | 0 | 0 | 0 | 2 | 1 | 4 | #48, #50 |
| 5 | 30/10 – 12/11 | 5 | 1 | 15 | 12 | 5 | 1 | 39 | #72, #75, #77, #86, #93 |
| 6 | 13/11 – 18/11 | 7 | 4 | 6 | 4 | 4 | 1 | 26 | #104, #116, #122, #129 |

Los commits de un integrante pueden entrar en el PR de
otro: el #49 de Ramiro, por ejemplo, lleva commits de Nicolás. Los conteos miden PRs, no esfuerzo.

---

## Sprint 2 — Desarrollo Modular II · 11/09 – 23/09

**Objetivo de la cátedra:** finalización del módulo de integración e implementación de testing.
El squad fijó el 24/09 como límite para codear, para llegar al Hito 1 con todo desplegado.

**Entregado:**

| Tema | PRs |
|---|---|
| Choferes como entidad propia y credencial de chofer (CU-09, CU-10, ADR-009) | #13, #14, #17, #18, #21, #22, #24 |
| Fuera de servicio de un contenedor (CU-01) | #28 |
| Migración que no puede tumbar el deploy, y cuatro fallas de revisión | #30 |
| Frontend sin códigos de caso de uso, menú lateral, README | #36, #37 |
| Auditoría de `@Roles()` sobre rutas, choferes y predicción | #41 |
| Tests del frontend aislados de la URL de Render | #20 |
| Guion de la demo del Hito 1 y ensayos contra Render | #25, #26, #39, #44, #45 |
| Estado y contratos al día | #23, #27, #35 |
| Deploy de Render con hooks verificados desde el CI | #33 (a `main`) |

La deuda que declaró el Sprint 1 (outbox, tests de integración contra Postgres, migraciones) ya
había entrado el 02/09. El driver `rabbitmq` no se hizo: lo reemplazó la integración con el
gateway del Squad 1 ([ADR-010](../adr/ADR-010-integracion-real-con-el-bus.md)).

**Retrospectiva** (facilitó Tomás, Scrum Master):

- **Bien:** se pagó toda la deuda que declaró el Sprint 1: outbox, tests de integración contra Postgres y migraciones. El CI pasó a verificar el deploy de Render, y la demo del Hito 1 se ensayó contra Render, no en local.
- **Mal:** el trabajo quedó concentrado en dos personas: Máximo y Francisco hicieron 19 de los 22 PRs, y Nicolás y Tomás no mergearon ninguno. Además, los ensayos se dejaron para los últimos días, así que las correcciones del testeo pre-Hito no llegaron a entrar antes del 24/09.
- **Acciones:** que cada integrante tenga al menos un caso propio con PR a su nombre (se cumplió desde el Sprint 5, con los casos integradores) y fijar un día límite para codear antes de cada hito (se aplicó el 24/09 y otra vez el 18/11).

---

## Hito 1 — Entrega Parcial · 24/09 – 01/10

**Pedido de la cátedra:** módulo funcional sin integración, evidencia de testing, evidencia de
trabajo en Git y tableros, diagramas UML (casos de uso y entidad-relación).

Ventana de presentación. No se mergearon PRs. Las correcciones del testeo pre-Hito (commits del
23/09) se mergearon recién el 16/10, en el #47.

---

## Sprint 3 — Planificación · 02/10 – 15/10

**Objetivo de la cátedra:** diseño colaborativo de casos de uso transversales, identificar los
servicios involucrados en cada caso y activar chapters técnicos por tema (seguridad, testing,
DevOps).

Es un sprint de planificación: lo que se espera son acuerdos entre squads, no código. Los
contratos de eventos con otros squads están en
[contratos-de-eventos.md](../arquitectura/contratos-de-eventos.md) y se implementaron desde el
Sprint 4. Lo que pasó con esos acuerdos está en la retrospectiva.

**Registrado en GitHub:** no hay PRs mergeados en este rango. El único commit es de Ramiro
(15/10): apuntar el Blueprint de Render a la base restaurada, que entró a `main` en el #48.

**Retrospectiva:**

- **Bien:** se acordaron con los otros squads los contratos de eventos que después se implementaron, y se definió el reparto de los casos integradores del grupo 4.
- **Mal:** como era un sprint de planificación, los acuerdos quedaron en chats y reuniones y no en el repo. Hoy no se puede probar qué se acordó, con quién ni cuándo. Las correcciones del Hito 1 tampoco se mergearon en este sprint.
- **Acciones:** todo acuerdo con otro squad se registra en `contratos-de-eventos.md` o en una bitácora (la de Máximo arrancó el 22/10), y ninguna rama queda abierta más de un sprint sin PR.

---

## Sprint 4 — Desarrollo Modular I · 16/10 – 29/10

**Objetivo de la cátedra:** desarrollo de casos de uso colaborativos entre squads y validación
funcional de eventos entre servicios.

**Entregado:**

| Tema | PRs |
|---|---|
| Seis bugs del testeo pre-Hito | #47 (Adriel) |
| Foco del menú lateral y errores cubiertos | #49 (Ramiro) |
| Release a `main` y sincronización | #50, #51 |
| **Integración con el bus de CityPass+ (CU-INT-01)**: webhook, módulo `integracion` | #52 (Nicolás) |

El #52 es la base sobre la que se montaron después los casos integradores de todos.

**Retrospectiva:**

- **Bien:** con el #52 entró la integración real con el bus de CityPass+, que fue la base de los casos de todos. Además, se cerraron los seis bugs del testeo pre-Hito.
- **Mal:** solo hubo 4 PRs y el resto se trabó esperando a otros. Hubo PRs sin revisar durante días (el #57 esperó desde el 22/10), dependencias de otros squads sin respuesta (token, namespace y campos de `ActividadCreada`) y casos sin rama todavía, entre ellos el de Tomás. `main` se quedó en el #50 del 16/10.
- **Acciones:** cualquier integrante puede aprobar, no hace falta esperar al dueño del módulo. Las dependencias de otros squads se reclaman en el grupo con fecha. Si un caso está bloqueado, se avanza en una rama aparte para no frenar el PR que está en revisión.

---

## Sprint 5 — Desarrollo Modular II · 30/10 – 12/11

**Objetivo de la cátedra:** integración de casos de uso, tests de integración y comunicación, y
coordinación entre squads.

**Entregado, por caso integrador:**

| Caso | Dueño | PRs |
|---|---|---|
| CU-INT-01: emergencias e incidentes viales bloquean zonas | Nicolás | #62, #79, #81, #84 |
| CU-INT-02: auto que tapa un contenedor (Reclamos) | Francisco | #53, #54, #55, #58, #61, #66, #68, #82, #94, #95, #98, #99 |
| Recolección después de un evento masivo (Espacios, `ActividadCreada`) | Máximo | #57, #64, #65, #80, #83, #85 |
| Intervención después de una emergencia | Adriel | #60 |
| Reserva de espacio público con limpieza a la salida | Tomás | #74 |
| Login federado, inundaciones y eventos climáticos | Ramiro | #71, #73, #90, #97 |

**También:**

| Tema | PRs |
|---|---|
| Sección para embeber el tablero de Analítica | #63 (Nicolás) |
| Pantalla de ingreso de Residuos | #76 (Ramiro) |
| El menú lateral queda por encima del zoom del mapa | #91 (Máximo) |
| Bitácora y ensayos del caso de Máximo | #67, #69, #78, #87, #88, #89, #92, #96 |

**Releases a `main`:** #72 (Login federado e integración con el bus), #75, #77, #86 y #93.

**Retrospectiva:**

- **Bien:** fue el sprint de más volumen: 39 PRs y los seis casos integradores con código. Entraron el login federado y el consumo por Kafka, y hubo cinco releases a `main`.
- **Mal:** recién en este sprint apareció que cada caso necesitaba una métrica para Analítica, y no estaba claro quién la definía: si nosotros o ellos. Hubo idas y vueltas con Analítica. También hubo fallas que solo aparecieron contra el bus real, como mensajes que no se podían decodificar, versiones en el tipo del evento y la URL del gateway.
- **Acciones:** cada métrica se acuerda por escrito con el referente de Analítica de cada caso (la de Tomás quedó acordada el 04/11 con Francisco Csik y está en `contratos-de-eventos.md`). Cada caso se prueba contra el bus de test antes de pedir revisión, no solo con tests unitarios.

---

## Sprint 6 — Desarrollo Modular III · 13/11 – 18/11

**Objetivo de la cátedra:** revisión global de la arquitectura integrada, documentación final y
ajuste de interfaces.

**Entregado:**

| Tema | Dueño | PRs |
|---|---|---|
| CU-INT-01: emergencias ya cerradas, causa para Analítica, espera de 45 s al gateway | Nicolás | #102, #103, #105, #110, #115, #117, #126 |
| CU-INT-02: parada cancelada para Analítica, barrio y métrica propia, guion conjunto | Francisco | #100, #101, #114, #119 |
| Evento masivo: `ActividadCreada` v3 de EDA, mapa, guion de 7 minutos | Máximo | #107, #108, #118, #120, #127, #130 |
| Intervención por emergencia con `causaTipo` EMERGENCIA | Adriel | #112 |
| Espacios: retirar o reanudar la limpieza; cobertura PREVENTIVA; eventos de Emergencias | Tomás | #109, #111, #124, #125 |
| Tablero de Analítica embebido, barrios, alertas climáticas, simulación de lecturas | Ramiro | #106, #121, #123, #128 |

**Releases a `main`:** #104, #116, #122 y #129 (18/11, último antes del Hito 2).

**Evidencia del cierre:** suites del CI de `main` en
[evidencia-despliegue.md](../devops/evidencia-despliegue.md#suites-de-tests-en-el-ci-de-main-18112026).

**Retrospectiva:**

- **Bien:** fue un cierre ordenado. Se ajustaron las interfaces con Emergencias, Espacios y Analítica, y cada caso quedó verificado en producción con su evento en la consola del bus (el de Tomás, el 17/11). Hubo cuatro releases a `main` y el último entró el 18/11, antes del freeze.
- **Mal:** la documentación de cierre (sprints 2 a 6, ADRs y diagramas) se escribió al final y reconstruida, cuando se tendría que haber ido completando sprint a sprint. También hubo cambios de contrato a último momento, como la v3 de `ActividadCreada` y las coberturas PREVENTIVA de Emergencias, que obligaron a hacer fixes en la última semana.
- **Acciones:** para una próxima entrega, cerrar cada sprint con su documento y su retro el último día, y congelar los contratos entre squads una semana antes del hito.
