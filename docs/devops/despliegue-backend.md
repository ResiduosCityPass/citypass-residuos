# Desplegar el backend

Guía operativa del backend en cloud: variables de entorno, migraciones, health check y trampas del
plan gratuito.

Está escrita para Render porque es el destino elegido en [ADR-008](../adr/ADR-008-destino-cloud.md).
La infraestructura vive en [`render.yaml`](../../render.yaml).

Actualizado para Login federado y EDA el 02/11/2026. El Blueprint y las imágenes se
preparan en el repositorio; su actualización no implica que ya se haya publicado
esta versión en Render.
Ver [validación de imágenes, Login y datos de demo](preparacion-login-eda-2026-11-02.md),
incluyendo la limitación de conectividad observada con el broker durante esa prueba.

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
| `GATEWAY_CLIENT_SECRET` | Credencial del servicio Residuos ante EDA | **Secreto**, no va en el repo |

Si no se usa `DATABASE_URL`, entonces son obligatorias:

| Variable | Qué es |
|---|---|
| `DB_HOST` | Host de PostgreSQL |
| `DB_PORT` | Puerto |
| `DB_USER` | Usuario |
| `DB_PASSWORD` | Contraseña |
| `DB_NAME` | Nombre de la base |

`JWT_SECRET` firma solamente credenciales internas del chofer en modo federado.
Los tokens humanos se verifican con RS256/JWKS. Conservar el secreto del backend
existente para no invalidar choferes; en una instalación nueva cargar un secreto
exclusivo y aleatorio. No usar el ejemplo de desarrollo.

Render solicita `sync: false` al crear un Blueprint, pero **ignora las variables
nuevas de ese tipo al sincronizar uno existente**. Antes de actualizar este backend,
cargar manualmente `GATEWAY_CLIENT_SECRET` en su Environment y comprobar que `JWT_SECRET`
ya existe. No se versionan ni se pasan como `VITE_*`.
Fuente: [secretos en Blueprints](https://render.com/docs/blueprint-spec#prompting-for-secret-values).

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

### Login y EDA en el Blueprint

| Variable | Configuración preparada |
| --- | --- |
| `AUTH_MODE` | `federated` |
| `JWT_ISSUER` | `https://idp.citypass.local` |
| `JWT_JWKS_URL` | `https://api.citypass-login.pp.ua/.well-known/jwks.json` |
| `JWT_AUDIENCE` / `JWT_MODULE` | `citypass-residuos-api` / `residuos` |
| `JWT_ISSUER_CHOFERES` | `citypass-residuos-choferes`, distinto del emisor humano |
| `JWT_OPERATOR_GROUPS` | `operador,delegados`; `delegados` no tiene rol administrador |
| `EVENT_BUS_DRIVER` | `platform`, publica por el gateway real |
| `GATEWAY_CLIENT_ID` / `GATEWAY_NAMESPACE` | `grupo6` / `com.citypass.residuos` |
| `GATEWAY_URL` | `https://test.citypass.mrfranco.net.ar` (raíz, sin `/api/v1`) |
| `GATEWAY_TOKEN_URL` | `https://api.citypass-login.pp.ua/oauth/token` |
| `KAFKA_BROKERS` | `test.citypass.mrfranco.net.ar:9092` |
| `KAFKA_GROUP_ID` | `com.citypass.residuos.api` |
| `CLIMA_SIMULADOR_HABILITADO` / `CLIMA_SIMULACRO_EDA_HABILITADO` | `false` / `false` |

El grupo local del ejemplo es `com.citypass.residuos.residuos-clima-local-v1`.
No usar el mismo grupo para el servidor cloud y una prueba local: repartirían
mensajes entre ellos. EDA recibe un token OAuth de servicio propio, no el JWT humano.

El frontend se compila con `VITE_AUTH_MODE=federated`,
`VITE_IDP_URL=https://api.citypass-login.pp.ua` y
`VITE_IDP_CLIENT_ID=citypass-residuos-web`. `VITE_API_ORIGIN` referencia al backend
y `VITE_API_PREFIX=api/v1`; CORS referencia al frontend. Mocks y simulación GPS
permanecen apagados. Un cambio `VITE_*` requiere recompilar el frontend.

### Otras variables

| Variable | Default | Qué cambia |
|---|---|---|
| `PORT` | `3000` | Render puede inyectarlo automáticamente |
| `API_PREFIX` | `api/v1` | Prefijo de rutas; si cambia, también cambia el frontend |
| `JWT_ALGORITHM` | `HS256` | Credenciales internas; humanos usan RS256 en modo federado |
| `JWT_EXPIRES_IN` | `8h` | Configuración de firmado interno; el CLI de demo usa dos horas |

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

El tráfico saliente del consumidor Kafka no mantiene despierto un servicio Free:
Render mide tráfico entrante HTTP/WebSocket. Despertar el backend antes de la demo
y comprobar **Kafka conectado** en Eventos climáticos. Tras un reinicio, el inbox
persistente y los offsets permiten retomar los eventos que sigan retenidos en EDA.
Fuente: [suspensión por inactividad](https://render.com/docs/free#spinning-down-on-idle).
Para consumo continuo fuera de una demo se necesita una instancia que permanezca
activa; este cambio no contrata un plan ni modifica el servicio remoto.

## 6. Chequeo rápido después del deploy

Antes de publicar, ejecutar desde `backend`:

```bash
npm ci
npm run build
npm run deploy:verificar
```

El último comando verifica el Blueprint usando el validador real de la aplicación,
la alineación de Login/frontend/CORS, secretos externos, TLS, grupos Kafka separados
y simuladores deshabilitados. También corre en CI y no conecta servicios externos.

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

Luego iniciar sesión con el delegado de Residuos, comprobar rol **OPERADOR** y abrir
Eventos climáticos: debe mostrar **Kafka conectado**. Health verifica aplicación/base;
por sí solo no demuestra la conexión a EDA. Completar una prueba con alerta nueva
cuando Espacios Públicos confirme su publicación.

Los [datos reproducibles de inundación](../arquitectura/datos-demo-inundacion.md)
se preparan con `demo:preparar`. El CLI compilado también está incluido en la imagen.
No necesita habilitar el simulador HTTP ni un login humano administrador. En el plan
Free de Render, sin Shell/one-off jobs, puede ejecutarse desde una computadora
autorizada contra la base externa. Ver [límites del plan](https://render.com/docs/free#other-limitations).

## 7. CD desde GitHub Actions

Render esta configurado con `autoDeployTrigger: off`. El deploy de produccion ocurre en el job
`Deploy — Render` del workflow `CI`, solo despues de que backend, frontend, Docker y SonarQube
terminan en verde sobre `main`.

El job usa dos secretos del repositorio, que no se versionan:

- `RENDER_DEPLOY_HOOK_API`
- `RENDER_DEPLOY_HOOK_FRONTEND`

Son los deploy hooks de los servicios correspondientes en Render. Al terminar el job hay que
confirmar el estado final en el dashboard y correr los chequeos de la seccion anterior.

## 8. Evidencia del despliegue

La evidencia del Blueprint creado, URLs publicas y chequeos post-deploy esta en
[`evidencia-despliegue.md`](evidencia-despliegue.md).

## 9. Documentos relacionados

- [ADR-002](../adr/ADR-002-persistencia.md) — por qué el esquema sale de migraciones.
- [ADR-005](../adr/ADR-005-seguridad-identidad.md) — identidad, roles y health público.
- [ADR-008](../adr/ADR-008-destino-cloud.md) — elección de Render.
- [Infra README](../../infra/README.md) — estado de tareas DevOps.
