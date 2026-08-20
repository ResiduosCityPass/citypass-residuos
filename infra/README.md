# Infraestructura — dueño: Ramiro (DevOps)

## Entorno local

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

| Servicio | Puerto | Credenciales |
|---|---|---|
| PostgreSQL 16 | 5432 | `citypass` / `citypass` / db `residuos` |
| RabbitMQ | 5672 (AMQP), 15672 (consola) | `citypass` / `citypass` |

RabbitMQ está declarado pero no se usa hasta el Sprint 2: hasta entonces el backend corre con
`EVENT_BUS_DRIVER=inmemory` y no necesita broker. Ver [ADR-003](../docs/adr/ADR-003-integracion-event-bus.md).

## Pendientes de este rol

| # | Tarea | Sprint |
|---|---|---|
| 1 | Proteger `main` en GitHub: PR obligatorio, CI en verde, sin auto-merge propio | 0 |
| 2 | `Dockerfile` multi-stage para el backend | 1 |
| 3 | `Dockerfile` para el frontend (depende del stack que defina Máximo en el ADR-006) | 2 |
| 4 | Job de deploy en el pipeline | 3 |
| 5 | Elegir destino cloud y escribirlo como IaC — dimensión 7 de la rúbrica pide *infraestructura como código*, no despliegue manual | 3-4 |

Toda decisión de infraestructura que tenga más de una opción razonable necesita su ADR
en `docs/adr/`. Es requisito explícito de la cátedra.
