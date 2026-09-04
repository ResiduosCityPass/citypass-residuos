# Desplegar el backend

Todo lo que necesita el servicio del backend para correr en la nube: variables de entorno,
migraciones, health check y las tres trampas que ya encontramos.

Escrito para Render, pero nada de acá es específico de Render salvo donde se aclara.

---

## 1. Lo que ya está resuelto

No hace falta tocar nada de esto:

- **`backend/Dockerfile`** — multi-stage, corre como usuario `node` sin privilegios, `dumb-init`
  como PID 1 y `HEALTHCHECK` propio. Probado: arranca en ~2 s y sirve datos reales.
- **El esquema sale de migraciones**, no de `synchronize`. Ver [ADR-002](../adr/ADR-002-persistencia-y-orm.md).
- **La aplicación escucha en `0.0.0.0`** y toma el puerto de `PORT`, que es lo que inyecta el
  orquestador.
- **TLS contra la base**, con `DB_SSL=true`.

## 2. Variables de entorno

### Obligatorias — sin estas no arranca

`validarEntorno` corta el arranque si falta alguna, a propósito: es más barato descubrirlo en el
deploy que en el primer request.

| Variable | Qué es | Valor en Render |
|---|---|---|
| `DB_HOST` | Host de PostgreSQL | Del connection string de la base |
| `DB_PORT` | Puerto | `5432` |
| `DB_USER` | Usuario | Del connection string |
| `DB_PASSWORD` | Contraseña | **Secreto**, no va en el repo |
| `DB_NAME` | Nombre de la base | Del connection string |
| `JWT_SECRET` | Clave de firma de los tokens | **Secreto.** Generar uno nuevo, largo y aleatorio |

> **`JWT_SECRET` no es el del `.env.example`.** Ese dice `dev-only-cambiar-en-produccion` y está
> versionado, así que lo tiene cualquiera que clone el repo. Con ese valor en la nube, cualquiera
> se firma un token de administrador. Generalo con `openssl rand -base64 48` y cargalo como
> secreto, nunca en un archivo del repo. Esto es de Adriel.

### Necesarias en la nube — tienen valor por defecto, pero el default no sirve desplegado

| Variable | Valor | Por qué |
|---|---|---|
| `NODE_ENV` | `production` | Baja el nivel de logging de TypeORM |
| `DB_SSL` | `true` | Los Postgres administrados exigen TLS. **En local va `false`**: el de Docker no lo soporta |
| `DB_MIGRATIONS_RUN` | `true` | Corre las migraciones pendientes al arrancar. Ver la sección 3 |
| `DB_SYNCHRONIZE` | `false` | **Nunca `true`.** Deja que el ORM reescriba el esquema por su cuenta y pise las migraciones |

### Opcionales — solo si hay que cambiar el comportamiento

Todas tienen un valor por defecto razonable y la aplicación arranca sin ellas.

| Variable | Default | Qué cambia |
|---|---|---|
| `PORT` | `3000` | Render lo inyecta solo; no hace falta definirlo |
| `API_PREFIX` | `api/v1` | Prefijo de todas las rutas. **Si lo cambiás hay que avisarle al frontend** |
| `JWT_ISSUER` | `citypass-squad2` | Emisor de los tokens. Cambia en el Sprint 3 |
| `JWT_AUDIENCE` | `citypass-residuos-api` | Destinatario que el guard exige en `aud` |
| `JWT_ALGORITHM` | `HS256` | Pasa a `RS256` en el Sprint 3, y eso además necesita código nuevo |
| `JWT_EXPIRES_IN` | `8h` | Duración de los tokens de desarrollo |
| `EVENT_BUS_DRIVER` | `inmemory` | `inmemory` hasta que exista el bus del Squad 1 |
| `RADIO_CONFIRMACION_VACIADO_METROS` | `100` | Radio para confirmar una parada (CU-10) |
| `DEPOSITO_LAT` / `DEPOSITO_LNG` | Obelisco | Punto de partida y llegada del ruteo (CU-08) |
| `OUTBOX_INTERVALO_MS` | 5000 | Cada cuánto el despachador vacía la tabla de eventos |
| `OUTBOX_LOTE` | 20 | Eventos por lote |
| `OUTBOX_MAX_INTENTOS` | 5 | Reintentos antes de mandarlo a dead letter |
| `PREDICCION_MAX_LECTURAS` | — | Ventana de lecturas del modelo de CU-12 |

**No definir `DB_NAME_TEST`**: es solo para los tests de integración.

## 3. Migraciones

Dos formas, y para Render conviene la primera.

### Al arrancar — `DB_MIGRATIONS_RUN=true`

La aplicación corre las migraciones pendientes antes de aceptar tráfico. Sin pasos extra en el
pipeline y sin comandos manuales.

> **El límite:** con más de una instancia, todas intentan migrar a la vez. Con el plan gratuito de
> Render hay una sola, así que no es problema hoy. Si algún día hay dos, esto pasa a ser un paso
> aparte del deploy.

### Como paso aparte

```bash
npm run migration:run:prod
```

Usa `dist/config/data-source.js`, o sea el código ya compilado — no necesita `ts-node`, que es una
dependencia de desarrollo y no está en la imagen. `npm run migration:run` **no sirve en la imagen**
por esa razón.

Para ver el estado sin aplicar nada:

```bash
npx typeorm -d dist/config/data-source.js migration:show
```

## 4. Health check

```
GET /api/v1/health
```

**Público a propósito** ([ADR-005](../adr/ADR-005-seguridad-identidad.md)): lo consultan el
orquestador y el pipeline, que no tienen credenciales de usuario. Devuelve `200` con:

```json
{ "status": "ok", "service": "residuos-service", "timestamp": "..." }
```

La imagen ya trae su propio `HEALTHCHECK` apuntando ahí. En Render se configura la misma ruta como
*Health Check Path*.

## 5. Las tres trampas

### El servicio gratuito se duerme

Render suspende los servicios gratuitos por inactividad, y el primer request después tarda bastante
en responder. **Para una demo en vivo esto es un riesgo real:** si el evaluador entra y la página
tarda medio minuto, parece que no funciona.

Dos salidas: despertarlo unos minutos antes de presentar, o un ping periódico que lo mantenga
arriba.

### La base también se apaga

En el plan gratuito la base tiene fecha de vencimiento y se elimina pasado ese plazo. **Hay que
saber cuándo vence antes del 24/09.** Si vence, se pierden los datos del seed y hay que volver a
sembrar — no es grave, pero no es algo para descubrir el día de la demo.

### CORS acepta cualquier origen

`main.ts` tiene `origin: true`, que refleja el origen de quien pregunte y además permite
credenciales. Sirve en local; desplegado significa que cualquier sitio puede pegarle a la API desde
el navegador de un usuario logueado. **Es de Adriel**, y conviene acotarlo al dominio del frontend
antes de que esto quede público.

## 6. Deuda anotada

**`DB_SSL=true` desactiva la validación del certificado** (`rejectUnauthorized: false`). El tráfico
va cifrado igual; lo que no se valida es la cadena, porque los proveedores administrados firman con
una CA propia que no está en el almacén del contenedor. Lo correcto es montar el certificado de la
CA del proveedor y validar contra él. Queda anotado, no olvidado.

## 7. Chequeo rápido después del deploy

```bash
curl -s https://<host>/api/v1/health
```

```bash
curl -s "https://<host>/api/v1/publico/contenedores/cercanos?lat=-34.6037&lng=-58.3816&radioMetros=1500"
```

El segundo es el mejor humo de todos: es público, no necesita token, y **para responderlo hay que
haber llegado hasta la base**. Si devuelve un array, están andando la aplicación, la conexión y el
esquema. Si devuelve `[]`, todo funciona pero falta sembrar datos.

Que la API responda `401` en cualquier otro endpoint es **buena señal**: significa que los guards
están activos.

---

## Documentos relacionados

- [ADR-002](../adr/ADR-002-persistencia-y-orm.md) — por qué el esquema sale de migraciones
- [ADR-005](../adr/ADR-005-seguridad-identidad.md) — identidad, roles y por qué el health es público
- [Guía de integración](../arquitectura/guia-frontend.md) — el contrato de la API
