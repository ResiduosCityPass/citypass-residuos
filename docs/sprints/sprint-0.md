# Sprint 0 — Planificación · 06/08 – 27/08

## Objetivo

Dejar el squad operativo: roles asignados, stack definido, repositorio con estructura, board
armado y CI/CD corriendo. Al cierre no se espera funcionalidad, se espera **capacidad de producirla**.

## Entregables exigidos por la cátedra

| Entregable | Estado | Responsable | Evidencia |
|---|---|---|---|
| Armar squad | Listo | Todos | Tabla de roles, abajo |
| Definir el módulo a desarrollar | Listo | Nicolás | Gestión de Residuos Inteligente (Grupo 4) |
| Asignación de stack | Listo | Francisco | [ADR-001](../adr/ADR-001-stack-tecnologico.md) |
| Setup de repositorio | Listo | Francisco | Este monorepo |
| Setup de board | **Pendiente** | Tomás | Trello o Jira con el backlog cargado |
| Setup de CI/CD | En curso | Ramiro | `.github/workflows/ci.yml` |

## Roles

| Integrante | Rol | Responsabilidad en el squad |
|---|---|---|
| Nicolás Damm | PM / Product Owner | Prioriza el backlog, es el enlace con las otras squads y con la cátedra |
| Tomás Luraschi | Scrum Master | Facilita ceremonias, mantiene el board, destraba impedimentos |
| Máximo Trufelman | Frontend | SPA React, mapa Leaflet (CU-07, CU-11) |
| Francisco Isola | Backend | API NestJS, modelo de datos, motor de reglas, eventos |
| Ramiro Souto | DevOps | Docker, CI/CD, despliegue cloud |
| Adriel Pasik | Security / Backend | JWT y roles, integración con el Squad 2, apoyo en backend |

## Decisiones tomadas

1. **Stack:** NestJS + TypeScript / PostgreSQL / React + Leaflet — [ADR-001](../adr/ADR-001-stack-tecnologico.md), [ADR-002](../adr/ADR-002-persistencia.md)
2. **Integración con el bus:** abstracción intercambiable, no esperamos al Squad 1 — [ADR-003](../adr/ADR-003-integracion-event-bus.md)
3. **Alcance:** 11 CU relevados → 6 en Tier 1, recortes documentados, se agrega CU-12 — [ADR-004](../adr/ADR-004-alcance-y-recortes.md)
4. **Seguridad:** guard global, todo protegido por default — [ADR-005](../adr/ADR-005-seguridad-identidad.md)

## Acciones abiertas antes del 27/08

| # | Acción | Responsable |
|---|---|---|
| 1 | Crear el repositorio en GitHub y sumar a los 6 integrantes como colaboradores | Francisco |
| 2 | Proteger `main`: exigir PR aprobado y CI en verde | Ramiro |
| 3 | Crear el board y cargar el Tier 1 como tarjetas con criterios de aceptación | Tomás |
| 4 | Contactar al **Squad 1** por el borrador de contrato del bus de eventos | Nicolás |
| 5 | Contactar al **Squad 2** por el claim de rol y el algoritmo de firma del JWT | Adriel |
| 6 | Contactar al **Squad 6** (Emergencias) por el consumo de `residuos.incendio.detectado` | Nicolás |

> Las acciones 4, 5 y 6 son las de mayor riesgo del sprint. No bloquean el desarrollo — por diseño,
> según ADR-003 y ADR-005 — pero cuanto antes se resuelvan, menos traducción hay que escribir en
> el Sprint 3.

## Plan del Sprint 1 (28/08 – 10/09)

| CU | Tarea | Responsable |
|---|---|---|
| — | Entidades TypeORM + migración inicial | Francisco |
| CU-01 | CRUD de contenedores y vinculación de sensor | Francisco |
| CU-02 | CRUD de zonas y umbrales | Francisco |
| CU-04 | Ingesta de lecturas + validación + guard de API key | Francisco / Adriel |
| CU-05 | Motor de reglas: detección de estado crítico + evento | Francisco |
| — | Simulador de sensores | Francisco |
| — | Guard JWT + roles con firma local | Adriel |
| — | docker-compose + pipeline de CI con umbral de cobertura | Ramiro |
| CU-07 | Maqueta del mapa consumiendo `/mapa/contenedores` | Máximo |

**Criterio de éxito del Sprint 1:** el simulador corre, las lecturas entran, un contenedor pasa a
crítico solo una vez, y el evento correspondiente queda registrado en el driver `inmemory`.
