# CityPass+ · Módulo de Gestión de Residuos Inteligente

Squad 4 — *Integración de Aplicaciones / Desarrollo de Aplicaciones II* — UADE, 2c 2026, curso 586386.

Módulo de la plataforma **CityPass+** encargado del monitoreo de contenedores urbanos mediante
sensores IoT, la detección de situaciones críticas (saturación e incendio) y la planificación
dinámica de rutas de recolección.

---

## Equipo

| Integrante | Rol |
|---|---|
| Nicolás Damm | Product Manager |
| Tomás Luraschi | Scrum Master |
| Máximo Trufelman | Frontend |
| Francisco Isola | Backend |
| Ramiro Souto | DevOps |
| Adriel Pasik | Security / Backend |

## Stack

| Capa | Tecnología | ADR |
|---|---|---|
| Backend | NestJS 11 + TypeScript | [ADR-001](docs/adr/ADR-001-stack-tecnologico.md) |
| Persistencia | PostgreSQL 16 + TypeORM | [ADR-002](docs/adr/ADR-002-persistencia.md) |
| Frontend | React 19 + Vite + Leaflet | [ADR-006](docs/adr/ADR-006-stack-frontend.md), [ADR-007](docs/adr/ADR-007-design-system-y-mocks.md) |
| Mensajería | Bus del Squad 1: outbox → gateway HTTP para publicar; Kafka y webhook para consumir | [ADR-003](docs/adr/ADR-003-integracion-event-bus.md), [ADR-010](docs/adr/ADR-010-integracion-real-con-el-bus.md), [ADR-012](docs/adr/ADR-012-tolerancia-a-contratos-entre-squads.md) |
| Identidad | Login federado del Squad 2 (LDAP + JWT RS256/JWKS) | [ADR-005](docs/adr/ADR-005-seguridad-identidad.md), [ADR-009](docs/adr/ADR-009-identidad-de-los-choferes.md), [ADR-013](docs/adr/ADR-013-endpoints-fuera-del-login-federado.md) |
| Métricas | Tablero de Analítica (Squad 8) embebido | [ADR-011](docs/adr/ADR-011-tablero-de-analitica-embebido.md) |
| Cloud | Render con `render.yaml` (IaC) | [ADR-008](docs/adr/ADR-008-destino-cloud.md) |
| CI/CD | GitHub Actions: lint, build, tests, Docker, SonarQube y deploy con compuerta | [Despliegue en la nube](docs/arquitectura/diagramas.md#9-despliegue-en-la-nube) |

## Estructura del repositorio

```
├── backend/      API REST NestJS · dueño: Francisco (+ Adriel en seguridad)
├── frontend/     SPA React · dueño: Máximo
├── simulator/    Simulador de sensores IoT que alimenta la API · dueño: Francisco
├── infra/        docker-compose, Dockerfiles, IaC · dueño: Ramiro
├── docs/
│   ├── adr/            Architecture Decision Records
│   ├── arquitectura/   Modelo de datos, contratos de eventos, API
│   ├── sprints/        Planificación y cierre por sprint
│   └── catedra/        Material provisto por la cátedra
└── .github/workflows/  CI/CD
```

## Cómo levantar el entorno

```bash
docker compose -f infra/docker-compose.yml up -d
cd backend && npm install && npm run migration:run && npm run start:dev
```

La API queda en `http://localhost:3000` y la documentación Swagger en `http://localhost:3000/docs`.

## Documentación clave

- [Desplegar el backend](docs/devops/despliegue-backend.md) — variables de entorno, migraciones y trampas del plan gratuito.
- [Preparación de Login y EDA para cloud](docs/devops/preparacion-login-eda-2026-11-02.md) — configuración, pruebas de las imágenes y pasos pendientes al publicar.
- [Evidencia de despliegue](docs/devops/evidencia-despliegue.md) — URLs publicas, CI y chequeos post-deploy.
- [Guion de la demo del Hito 1](docs/sprints/guion-demo-hito-1.md) — que mostrar, en que orden y con que comandos.
- [Backlog priorizado](docs/sprints/backlog-priorizado.md) — qué construimos y en qué orden, con el recorte de alcance justificado.
- [Diagramas](docs/arquitectura/diagramas.md) — casos de uso, C4, secuencia y máquinas de estado.
- [Modelo de datos](docs/arquitectura/modelo-de-datos.md)
- [Contratos de eventos](docs/arquitectura/contratos-de-eventos.md) — qué publicamos y a qué nos suscribimos.
- [Inundaciones: suspensión y recuperación](docs/arquitectura/contingencias-inundacion.md) — flujo, simulador, contrato provisional y demo local.
- [Integración con Login y Espacios Públicos](docs/arquitectura/integracion-login-clima.md) — implementación, pruebas y datos pendientes de los equipos.
- [Simulacro climático por EDA](docs/arquitectura/simulacro-clima-eda.md) — publicar inicio y fin con la cuenta de Residuos y probar suspensión y recuperación por Kafka.
- [Datos reproducibles de la demo](docs/arquitectura/datos-demo-inundacion.md) — crear contenedores, zonas, camión, chofer y ruta inicial con un comando, conservando ensayos anteriores.
- [Prueba completa con EDA real](docs/arquitectura/prueba-eda-real-2026-11-02.md) — ejecución del 02/11, recuperación completada y seis mensajes verificados en el bus.
- [Prueba desde la web de Espacios Públicos](docs/arquitectura/prueba-espacios-web-2026-11-02.md) — nuevo intento del 02/11: la web confirmó y finalizó, pero sus publicaciones no llegaron a EDA.
- [Mensajes para los equipos](docs/arquitectura/consultas-integracion-equipos.md) — pedidos listos para copiar a EDA, Login y Espacios Públicos.
- [API preliminar](docs/arquitectura/api-preliminar.md)
- [Definition of Ready / Done](docs/sprints/definition-of-ready-done.md)
