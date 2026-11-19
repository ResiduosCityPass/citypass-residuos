# Architecture Decision Records

La cátedra exige que *"todas las decisiones de arquitectura de la plataforma deben documentarse
mediante un ADR que muestre las opciones consideradas"*.

Cada ADR sigue la misma estructura: **Contexto → Opciones consideradas → Decisión → Consecuencias**.
Un ADR nunca se edita una vez aceptado: si la decisión cambia, se escribe uno nuevo que lo supersede.

| ADR | Título | Estado |
|---|---|---|
| [001](ADR-001-stack-tecnologico.md) | Stack tecnológico del backend | Aceptado |
| [002](ADR-002-persistencia.md) | Motor de persistencia y acceso a datos | Aceptado |
| [003](ADR-003-integracion-event-bus.md) | Estrategia de integración con el event bus | Aceptado, superseded parcialmente por 010 |
| [004](ADR-004-alcance-y-recortes.md) | Alcance funcional y recortes deliberados | Aceptado |
| [005](ADR-005-seguridad-identidad.md) | Seguridad e identidad federada | Aceptado, superseded parcialmente por 009 y complementado por 013 |
| [006](ADR-006-stack-frontend.md) | Stack tecnológico del frontend | Aceptado |
| [007](ADR-007-design-system-y-mocks.md) | Design system, navegación y capa de datos falsos en el frontend | Aceptado |
| [008](ADR-008-destino-cloud.md) | Destino cloud para despliegue | Aceptado, superseded parcialmente por 010 |
| [009](ADR-009-identidad-de-los-choferes.md) | Identidad de los choferes | Aceptado |
| [010](ADR-010-integracion-real-con-el-bus.md) | Integración real con el bus de CityPass+ | Aceptado |
| [011](ADR-011-tablero-de-analitica-embebido.md) | Tablero de Analítica embebido en la aplicación | Aceptado |
| [012](ADR-012-tolerancia-a-contratos-entre-squads.md) | Tolerancia a contratos de eventos entre squads | Aceptado |
| [013](ADR-013-endpoints-fuera-del-login-federado.md) | Endpoints fuera del login federado | Aceptado |

Varios ADR anteriores recibieron secciones de actualización con fecha (por ejemplo, el ADR-005 con
el contrato del Squad 2). Desde el ADR-010, los cambios de decisión se registran en un ADR nuevo y
el anterior solo se marca como *superseded* en su encabezado.
