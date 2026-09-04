# Infraestructura — dueño: Ramiro (DevOps)

## Entorno local

```bash
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps
```

| Servicio | Puerto | Credenciales |
|---|---|---|
| Frontend | 8080 | `http://localhost:8080` |
| Backend API | 3000 | Health: `http://localhost:3000/api/v1/health` |
| PostgreSQL 16 | 5432 | `citypass` / `citypass` / db `residuos` |
| RabbitMQ | 5672 (AMQP), 15672 (consola) | `citypass` / `citypass` |

RabbitMQ está declarado pero no se usa hasta el Sprint 2: hasta entonces el backend corre con
`EVENT_BUS_DRIVER=inmemory` y no necesita broker. Ver [ADR-003](../docs/adr/ADR-003-integracion-event-bus.md).

## Pendientes de este rol

| # | Tarea | Sprint | Estado |
|---|---|---|---|
| 1 | Proteger `main` y `develop`: PR obligatorio, CI en verde, sin bypass | 0 | Guía lista en [`docs/devops/proteccion-ramas.md`](../docs/devops/proteccion-ramas.md) |
| 2 | `Dockerfile` multi-stage para el backend | 1 | **Hecho** — ver abajo |
| 3 | `Dockerfile` para el frontend (React + Vite: build y servir estáticos) | 2 | **Hecho** — ver abajo |
| 4 | Job de deploy en el pipeline | 3 | Pendiente |
| 5 | Elegir destino cloud y escribirlo como IaC — la dimensión 7 pide *infraestructura como código*, no despliegue manual | 3-4 | **Hecho** — Render + [`render.yaml`](../render.yaml) |

---

## Imagen del backend

Está en [`backend/Dockerfile`](../backend/Dockerfile). La escribió Francisco para desbloquear el
despliegue; **de acá en adelante es tuya**.

```bash
docker build -t citypass-residuos-api ./backend
```

Verificado: arranca, se conecta a Postgres, responde la API, el `HEALTHCHECK` pasa a `healthy`,
**corre como usuario `node` y no como root**, y las migraciones se pueden ejecutar desde la imagen.
Pesa 404 MB, que es lo normal para NestJS con TypeORM.

Ya está sumada al `docker-compose.yml` como servicio `api`.

### Migraciones en un entorno desplegado

Dos caminos, y conviene elegir a conciencia:

- `DB_MIGRATIONS_RUN=true` — la aplicación las corre al arrancar. Simple, pero si hay varias
  réplicas todas intentan migrar a la vez.
- Un paso previo al deploy, que es lo que yo haría:

  ```bash
  docker run --rm --env-file .env citypass-residuos-api npm run migration:run:prod
  ```

  Usa el CLI compilado, no `ts-node`, así que funciona en la imagen de producción.

### Tres cosas del Dockerfile que no son decorativas

- **Multi-stage.** La etapa de build necesita las devDependencies y el compilador de TypeScript;
  la imagen final no. Copiar el `node_modules` completo sumaría unos 400 MB de herramientas que
  nunca corren en producción.
- **`dumb-init` como PID 1.** Sin él, Node no recibe `SIGTERM` y el contenedor se mata a la fuerza
  a los 10 segundos. Eso cortaría al despachador del outbox en medio de un lote.
- **Usuario `node`.** Correr como root es innecesario y es de lo primero que mira cualquier
  revisión de seguridad.

## Imagen del frontend

Está en [`frontend/Dockerfile`](../frontend/Dockerfile). Compila React + Vite y sirve el resultado
con nginx.

```bash
docker build -t citypass-residuos-frontend ./frontend
```

Las variables `VITE_*` se inyectan al compilar la imagen. Para local, el compose deja
`VITE_API_URL=http://localhost:3000/api/v1`, así el navegador llama al backend publicado en el
puerto 3000.

Toda decisión de infraestructura que tenga más de una opción razonable necesita su ADR
en `docs/adr/`. Es requisito explícito de la cátedra.

## Destino cloud

El destino elegido para el despliegue académico es **Render**. La decisión está documentada en
[`ADR-008`](../docs/adr/ADR-008-destino-cloud.md).

La infraestructura está versionada en [`render.yaml`](../render.yaml): frontend estático, backend
Docker, PostgreSQL administrado y secretos configurados fuera del repo.

Para crear el entorno en Render:

1. Crear un Blueprint desde el repositorio.
2. Usar `render.yaml` desde la rama `main`.
3. Completar `JWT_SECRET` cuando Render lo pida. Ese valor no se versiona.
4. Mantener el mismo valor en el entorno local usado para `npm run token:dev`, si hace falta generar
   tokens de demo hasta que llegue el login federado.

El Blueprint usa planes gratuitos para evitar costos accidentales. Eso sirve para el TPO, pero tiene
dos límites: el backend puede dormir por inactividad y la base gratuita de Render expira a los 30
días.
