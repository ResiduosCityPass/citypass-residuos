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
| Mensajería | RabbitMQ (local) → bus del Squad 1 | [ADR-003](docs/adr/ADR-003-integracion-event-bus.md) |
| Identidad | JWT emitido por el Squad 2 (LDAP) | [ADR-005](docs/adr/ADR-005-seguridad-identidad.md) |
| CI/CD | GitHub Actions | — |

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

- [Desplegar el backend](docs/devops/despliegue-backend.md) — variables de entorno, migraciones y las trampas del plan gratuito.
- [Guion de la demo del Hito 1](docs/sprints/guion-demo-hito-1.md) — que mostrar, en que orden y con que comandos.
- [Backlog priorizado](docs/sprints/backlog-priorizado.md) — qué construimos y en qué orden, con el recorte de alcance justificado.
- [Diagramas](docs/arquitectura/diagramas.md) — casos de uso, C4, secuencia y máquinas de estado.
- [Modelo de datos](docs/arquitectura/modelo-de-datos.md)
- [Contratos de eventos](docs/arquitectura/contratos-de-eventos.md) — qué publicamos y a qué nos suscribimos.
- [API preliminar](docs/arquitectura/api-preliminar.md)
- [Definition of Ready / Done](docs/sprints/definition-of-ready-done.md)
