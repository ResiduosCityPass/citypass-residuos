# Desplegar el backend

Guía operativa del backend en cloud: variables de entorno, migraciones, health check y trampas del
plan gratuito.

Está escrita para Render porque es el destino elegido en [ADR-008](../adr/ADR-008-destino-cloud.md).
La infraestructura vive en [`render.yaml`](../../render.yaml).

---

## 1. Lo que ya está resuelto

No hace falta tocar nada de esto antes de crear el Blueprint:

- **`backend/Dockerfile`**: multi-stage, corre como usuario `node`, usa `dumb-init` como PID 1 y
  tiene `HEALTHCHECK` propio.
- **El esquema sale de migraciones**, no de `synchronize`. Ver [ADR-002](../adr/ADR-002-persistencia.md).
- **La aplicación escucha en `0.0.0.0`**, necesario para recibir tráfico desde fuera del contenedor.
- **CORS está acotado por `CORS_ORIGIN`** en producción.
- **TypeORM puede conectarse con `DATABASE_URL`** o con variables separadas.
- **El CLI de migraciones usa la misma configuración de base que la app** (`data-source.ts` lee
  `DATABASE_URL` y `DB_SSL`).

## 2. Variables de entorno

### Obligatorias

`validarEntorno` corta el arranque si falta configuración crítica. Para la base hay dos formatos
válidos: `DATABASE_URL` o las variables separadas.

| Variable | Qué es | Valor en Render |
|---|---|---|
| `DATABASE_URL` | Connection string de PostgreSQL | Inyectada con `fromDatabase.property: connectionString` |
| `JWT_SECRET` | Clave de firma de tokens | **Secreto**, no va en el repo |

Si no se usa `DATABASE_URL`, entonces son obligatorias:

| Variable | Qué es |
|---|---|
| `DB_HOST` | Host de PostgreSQL |
| `DB_PORT` | Puerto |
| `DB_USER` | Usuario |
| `DB_PASSWORD` | Contraseña |
| `DB_NAME` | Nombre de la base |

> **`JWT_SECRET` no es el del `.env.example`.** Ese valor está versionado para desarrollo local. En
> cloud hay que cargar uno nuevo, largo y aleatorio, como secreto de Render.

### Necesarias en cloud

| Variable | Valor en `render.yaml` | Por qué |
|---|---|---|
| `NODE_ENV` | `production` | Baja logging y ejecuta comportamiento de producción |
| `DB_SYNCHRONIZE` | `false` | El esquema lo gobiernan migraciones |
| `DB_MIGRATIONS_RUN` | `true` | Corre migraciones pendientes al arrancar |
| `DB_SSL` | `false` | Render inyecta la connection string interna; no requiere TLS |
| `CORS_ORIGIN` | URL pública del frontend | Evita CORS abierto en producción |

Si alguien corre migraciones desde una máquina externa contra la **External Database URL** de Render,
ahí corresponde `DB_SSL=true`, porque esa conexión sale por internet y requiere TLS.

### Opcionales

| Variable | Default | Qué cambia |
|---|---|---|
| `PORT` | `3000` | Render puede inyectarlo automáticamente |
| `API_PREFIX` | `api/v1` | Prefijo de rutas; si cambia, también cambia el frontend |
| `JWT_ISSUER` | `citypass-squad2` | Emisor esperado de tokens |
| `JWT_AUDIENCE` | `citypass-residuos-api` | Audiencia esperada en `aud` |
| `JWT_ALGORITHM` | `HS256` | Pasará a `RS256` cuando llegue identidad federada |
| `JWT_EXPIRES_IN` | `8h` | Duración de tokens de desarrollo |
| `EVENT_BUS_DRIVER` | `inmemory` | Hasta que exista el bus real del Squad 1 |

No definir `DB_NAME_TEST` en cloud: es solo para tests de integración.

## 3. Migraciones

Para el primer deploy en Render usamos:

```bash
DB_MIGRATIONS_RUN=true
```

La aplicación aplica migraciones pendientes antes de aceptar tráfico. Con una sola instancia no hay
riesgo práctico de carreras. Si más adelante el backend escala a más de una instancia, las
migraciones deben pasar a un paso separado del deploy.

El comando correcto dentro de la imagen es:

```bash
npm run migration:run:prod
```

Usa `dist/config/data-source.js`, o sea código ya compilado. `npm run migration:run` no sirve dentro
de la imagen final porque depende de `ts-node`, que queda fuera de producción.

## 4. Health check

Render debe usar:

```text
GET /api/v1/health
```

Es público a propósito: lo consultan el orquestador y el pipeline, que no tienen credenciales de
usuario.

## 5. Plan gratuito de Render

Tres cosas para revisar antes de una demo:

- El servicio web gratuito puede dormirse por inactividad. Conviene despertarlo unos minutos antes.
- La base gratuita expira 30 días después de crearla. Hay que anotar la fecha de vencimiento.
- La base gratuita no tiene backups administrados. Para datos de demo, tener un seed repetible.

## 6. Chequeo rápido después del deploy

Primero despertar/probar health:

```bash
curl -s https://<host-api>/api/v1/health
```

Después validar app + conexión + esquema con un endpoint público:

```bash
curl -s "https://<host-api>/api/v1/publico/contenedores/cercanos?lat=-34.6037&lng=-58.3816&radioMetros=1500"
```

Si responde un array, la API llegó hasta PostgreSQL. Si responde `[]`, la app funciona pero falta
sembrar datos. Si un endpoint privado responde `401` sin token, es buena señal: los guards están
activos.

## 7. Documentos relacionados

- [ADR-002](../adr/ADR-002-persistencia.md) — por qué el esquema sale de migraciones.
- [ADR-005](../adr/ADR-005-seguridad-identidad.md) — identidad, roles y health público.
- [ADR-008](../adr/ADR-008-destino-cloud.md) — elección de Render.
- [Infra README](../../infra/README.md) — estado de tareas DevOps.
