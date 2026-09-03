# Guía de integración para frontend

**Para:** Máximo (frontend) · **Backend:** Francisco
**Estado:** endpoints de Sprint 1 implementados y verificados contra la API corriendo.

Todos los ejemplos de respuesta de este documento son **capturas reales de la API**, no
inventados. Si algo no coincide con lo que te devuelve, es un bug: avisame.

---

## 1. Lo mínimo para arrancar

| | |
|---|---|
| Base URL | `http://localhost:3000/api/v1` |
| Swagger interactivo | `http://localhost:3000/docs` |
| Formato | JSON en request y response |
| CORS | Habilitado para cualquier origen en desarrollo |

### Levantar el backend

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

```bash
cd backend && npm install && npm run start:dev
```

### Conseguir un token

**Todos los endpoints están protegidos.** Sin token recibís `401`. Hasta que el Squad 2
tenga listo el login federado, los tokens se firman localmente:

```bash
cd backend && npm run token:dev -- OPERADOR
```

Roles: `ADMINISTRADOR`, `OPERADOR`, `CHOFER`, `CIUDADANO`. Para tus pantallas vas a querer
`ADMINISTRADOR` (ve todo) u `OPERADOR`.

Mandalo en cada request:

```
Authorization: Bearer <token>
```

Dura 8 horas. Cuando el Squad 2 publique su emisor, esto se reemplaza y el header no cambia.

### Llenar la pantalla con datos

El simulador crea una zona con contenedores y les hace reportar lecturas, así ves el mapa
cambiar de color en vivo:

```bash
cd simulator && TOKEN=<tu-token> npm run seed
```

```bash
npm run saturacion
```

Con `npm run saturacion` uno de los contenedores cruza el umbral y pasa a rojo en ~5 segundos.
Con `npm run incendio` se dispara una alerta crítica. Son las dos cosas que vas a querer poder
provocar a voluntad mientras desarrollás, y también en la demo final.

---

## 2. Vocabulario del dominio

Estos valores llegan tal cual en las respuestas. Son los que tenés que mapear a UI.

### `EstadoContenedor` — el color del marcador en el mapa

| Valor | Color | Qué significa |
|---|---|---|
| `NORMAL` | Verde | Por debajo del umbral de su zona |
| `ADVERTENCIA` | Amarillo | A menos de 10 puntos del umbral |
| `CRITICO` | Rojo | Alcanzó o superó el umbral. Hay que recolectarlo |
| `FUERA_DE_SERVICIO` | Gris | Roto o en mantenimiento. **Las lecturas no lo sacan de este estado** |

### `TipoResiduo`

`COMUN` · `RECICLABLE` · `ORGANICO`

### `TipoAlerta`

| Valor | Origen |
|---|---|
| `SATURACION` | El contenedor cruzó el umbral de llenado |
| `INCENDIO` | Temperatura interna sobre el umbral. Máxima prioridad |
| `BATERIA_BAJA` | El sensor reportó 20% o menos |
| `SENSOR_CAIDO` | Definido, todavía no se genera |

### `Severidad`

`BAJA` · `MEDIA` · `ALTA` · `CRITICA`

Para saturación se calcula según cuánto se pasó del umbral: `BAJA` si recién lo cruzó,
`CRITICA` si llegó a 100%. Incendio siempre es `CRITICA`.

### `EstadoAlerta`

`ABIERTA` → `EN_ATENCION` → `RESUELTA`

El operador la toma (`atender`) y después la cierra (`resolver`). No se puede saltear ni volver atrás.

### `EstadoSensor`

`ACTIVO` · `BATERIA_BAJA` · `SIN_SENAL` · `INACTIVO`

---

## 3. Errores — leelos una vez y no los mirás más

**Todos** los errores tienen exactamente esta forma:

```json
{
  "statusCode": 409,
  "error": "CONFLICT",
  "message": "Ya existe una zona con el nombre \"Centro\"",
  "code": "ZONA_NOMBRE_DUPLICADO",
  "timestamp": "2026-08-20T23:37:39.166Z",
  "path": "/api/v1/zonas"
}
```

> **Ramificá siempre por `code`, nunca por `message`.**
> El `message` está en castellano y puede cambiar sin aviso; el `code` es estable y es
> parte del contrato. Podés mostrar `message` directo al usuario si te sirve.

### Códigos de negocio

| `code` | HTTP | Cuándo aparece |
|---|---|---|
| `ZONA_NO_ENCONTRADA` | 404 | La zona no existe |
| `ZONA_NOMBRE_DUPLICADO` | 409 | Ya hay una zona con ese nombre |
| `ZONA_CON_CONTENEDORES` | 409 | Querés borrar una zona que todavía tiene contenedores |
| `CONTENEDOR_NO_ENCONTRADO` | 404 | El contenedor no existe |
| `CONTENEDOR_CODIGO_DUPLICADO` | 409 | Ya hay un contenedor con ese código |
| `CONTENEDOR_YA_TIENE_SENSOR` | 409 | Ese contenedor ya tiene un sensor vinculado |
| `SENSOR_CODIGO_DUPLICADO` | 409 | Ya hay un sensor con ese código |
| `CAMION_PATENTE_DUPLICADA` | 409 | Ya existe un camión con esa patente (CU-03) |
| `CAMION_NO_ENCONTRADO` | 404 | El camión no existe (CU-03) |
| `CAMION_EN_RUTA` | 409 | No se puede cambiar el estado de un camión en ruta (CU-03) |
| `SIN_LECTURAS_SUFICIENTES` | 409 | No hay histórico suficiente para predecir (CU-12) |
| `TENDENCIA_NO_CRECIENTE` | 409 | El contenedor no se está llenando, no hay saturación que predecir (CU-12) |
| `ALERTA_NO_ENCONTRADA` | 404 | La alerta no existe |
| `ALERTA_NO_ABIERTA` | 409 | Quisiste atender una alerta que ya no está `ABIERTA` |
| `ALERTA_YA_RESUELTA` | 409 | Quisiste resolver una alerta ya cerrada |

### Códigos genéricos

| `code` | HTTP | Cuándo |
|---|---|---|
| `HTTP_400` | 400 | Validación fallida. **`message` viene como array de strings**, uno por campo |
| `HTTP_401` | 401 | Falta el token o está vencido |
| `HTTP_403` | 403 | Tu rol no alcanza. El `message` dice qué roles se aceptan |
| `HTTP_404` | 404 | Ruta inexistente |

Ejemplo de validación — ojo que acá `message` es un **array**:

```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "message": [
    "zonaId must be a UUID",
    "tipoResiduo must be one of the following values: COMUN, RECICLABLE, ORGANICO",
    "capacidadLitros must not be less than 1",
    "lat must be a latitude string or number"
  ],
  "code": "HTTP_400",
  "timestamp": "2026-08-20T23:37:09.421Z",
  "path": "/api/v1/contenedores"
}
```

> Enviar un campo que no está en el contrato también da `400`. La API rechaza propiedades
> desconocidas en vez de ignorarlas.

---

## 4. CU-07 · Mapa en tiempo real

**La pantalla principal, y por donde te conviene empezar.**

### `GET /mapa/contenedores`

Roles: `ADMINISTRADOR`, `OPERADOR`

**Query params, todos opcionales:**

| Param | Tipo | Ejemplo |
|---|---|---|
| `zonaId` | UUID | `?zonaId=63249e42-...` |
| `tipoResiduo` | enum | `?tipoResiduo=RECICLABLE` |
| `estado` | enum | `?estado=CRITICO` |

Se combinan: `?zonaId=63249e42-...&estado=CRITICO`

**Respuesta `200` — array:**

```json
[
  {
    "id": "13479ceb-47ce-47c9-8006-b47604beddd1",
    "codigo": "CT-0001",
    "lat": -34.608071,
    "lng": -58.377063,
    "estado": "CRITICO",
    "tipoResiduo": "COMUN",
    "nivelLlenadoPct": 94.14,
    "ultimaLecturaEn": "2026-08-20T22:50:02.199Z",
    "zonaNombre": "Centro",
    "umbralCriticoPct": 70,
    "incendioActivo": true
  }
]
```

> **Tres campos nuevos** que resuelven pedidos concretos del frontend:
>
> - **`incendioActivo`** — evita la segunda llamada a `/alertas?tipo=INCENDIO&estado=ABIERTA` en
>   cada refresco. Es `true` cuando el contenedor tiene un incendio abierto, **independientemente
>   de su `estado`**: un contenedor `NORMAL` al 8% puede tener `incendioActivo: true`, porque el
>   estado refleja el llenado y el incendio se evalúa contra la temperatura. Verificado con un
>   contenedor real en `NORMAL` al 59,2% e `incendioActivo: true`.
> - **`umbralCriticoPct`** — para dibujar la marca de referencia sobre la barra de llenado sin
>   pedir la zona aparte.
> - **`zonaNombre`** — para mostrarlo en el tooltip del marcador.
>
> El endpoint sigue resolviéndose en **dos consultas en total**, sin importar cuántos contenedores
> haya: una para los contenedores y otra para todos los incendios abiertos.

**Notas de implementación:**

- El payload sigue siendo flaco: solo lo necesario para pintar un marcador. Para el
  panel de detalle al hacer click, pegale a `GET /contenedores/:id`, que trae zona y sensor.
- `lat` y `lng` vienen como **número**, listos para Leaflet o lo que uses.
- `nivelLlenadoPct` es la última lectura, con 2 decimales.
- `ultimaLecturaEn` puede ser `null` si el contenedor todavía no reportó nunca.
- Nunca devuelve contenedores dados de baja.
- **Refresco:** hacé polling cada 30 segundos. WebSocket está evaluado para Sprint 5, si
  hay tiempo; no lo esperes.

---

## 5. CU-01 · Contenedores

### `GET /contenedores` — listado

Roles: `ADMINISTRADOR`, `OPERADOR`. Mismos query params que el mapa.

**Respuesta `200` — array de:**

```json
{
  "id": "13479ceb-47ce-47c9-8006-b47604beddd1",
  "codigo": "CT-0001",
  "zonaId": "63249e42-e2cf-429f-9c54-ffef4b73a1b1",
  "tipoResiduo": "COMUN",
  "capacidadLitros": 1100,
  "lat": -34.608071,
  "lng": -58.377063,
  "estado": "CRITICO",
  "nivelLlenadoPct": 94.14,
  "temperaturaC": 20.61,
  "ultimaLecturaEn": "2026-08-20T22:50:02.199Z",
  "activo": true,
  "sensor": {
    "id": "4c1f...",
    "codigo": "SN-0001",
    "contenedorId": "13479ceb-47ce-47c9-8006-b47604beddd1",
    "estado": "ACTIVO",
    "bateriaPct": 88,
    "ultimoReporteEn": "2026-08-20T22:50:02.199Z",
    "creadoEn": "...",
    "actualizadoEn": "..."
  },
  "creadoEn": "2026-08-20T22:49:05.393Z",
  "actualizadoEn": "2026-08-20T22:50:02.395Z"
}
```

> **`sensor` viene en el listado, y es `undefined` cuando no tiene.** Lo pediste porque sin esto
> "sin sensor" y "sensor que nunca reportó" se ven idénticos: los dos muestran 0% y
> `ultimaLecturaEn: null`. Con esto podés deshabilitar el botón de vincular en la fila que ya
> tiene uno, en vez de dejar que el usuario se coma un `409 CONTENEDOR_YA_TIENE_SENSOR`.
>
> **`apiKeyHash` no viaja nunca**, ni acá ni en el detalle: la columna está declarada
> `select: false` en el modelo. Si lo ves en algún lado, es un bug mío.

### `GET /contenedores/:id` — detalle

Igual que arriba **más `zona` y `sensor` anidados**:

```json
{
  "id": "13479ceb-47ce-47c9-8006-b47604beddd1",
  "codigo": "CT-0001",
  "zonaId": "63249e42-e2cf-429f-9c54-ffef4b73a1b1",
  "zona": {
    "id": "63249e42-e2cf-429f-9c54-ffef4b73a1b1",
    "nombre": "Centro",
    "umbralCriticoPct": 70,
    "umbralTemperaturaC": 60,
    "bloqueada": false,
    "creadaEn": "2026-08-20T22:49:05.319Z",
    "actualizadaEn": "2026-08-20T22:49:05.319Z"
  },
  "tipoResiduo": "COMUN",
  "capacidadLitros": 1100,
  "lat": -34.608071,
  "lng": -58.377063,
  "estado": "CRITICO",
  "nivelLlenadoPct": 94.14,
  "temperaturaC": 20.61,
  "ultimaLecturaEn": "2026-08-20T22:50:02.199Z",
  "activo": true,
  "sensor": {
    "id": "98b597d3-ddc5-462b-9e8d-5264226d32e7",
    "codigo": "SN-0001",
    "contenedorId": "13479ceb-47ce-47c9-8006-b47604beddd1",
    "estado": "ACTIVO",
    "bateriaPct": 99,
    "ultimoReporteEn": "2026-08-20T22:50:02.199Z",
    "creadoEn": "2026-08-20T22:49:05.434Z",
    "actualizadoEn": "2026-08-20T22:50:02.369Z"
  },
  "creadoEn": "2026-08-20T22:49:05.393Z",
  "actualizadoEn": "2026-08-20T22:50:02.395Z"
}
```

**`sensor` es `null` si el contenedor no tiene sensor vinculado.** Contemplalo en la UI: un
contenedor sin sensor nunca va a cambiar de estado, y vale la pena mostrarlo.

Con `zona.umbralCriticoPct` podés dibujar una barra de progreso con la marca del umbral —
el usuario entiende mucho mejor "94% sobre un umbral de 70" que solo "94%".

### `POST /contenedores` — alta

Rol: `ADMINISTRADOR`

**Mandás:**

```json
{
  "zonaId": "63249e42-e2cf-429f-9c54-ffef4b73a1b1",
  "tipoResiduo": "ORGANICO",
  "capacidadLitros": 2400,
  "lat": -34.6037,
  "lng": -58.3816,
  "codigo": "CT-CENTRO-01"
}
```

| Campo | Obligatorio | Reglas |
|---|---|---|
| `zonaId` | Sí | UUID de una zona existente. Si no existe → `404 ZONA_NO_ENCONTRADA` |
| `tipoResiduo` | Sí | `COMUN`, `RECICLABLE` u `ORGANICO` |
| `capacidadLitros` | Sí | Entero entre 1 y 100000 |
| `lat` | Sí | Latitud válida |
| `lng` | Sí | Longitud válida |
| `codigo` | **No** | 3 a 20 caracteres. Si no lo mandás, el backend genera `CT-0001`, `CT-0002`... |

**Respuesta `201`** — el contenedor creado. Arranca en `NORMAL` con `nivelLlenadoPct: 0`,
`temperaturaC: null` y `ultimaLecturaEn: null`:

```json
{
  "id": "ca458216-71f0-45e2-b0af-a06ff1c55ed6",
  "codigo": "CT-0005",
  "zonaId": "63249e42-e2cf-429f-9c54-ffef4b73a1b1",
  "tipoResiduo": "ORGANICO",
  "capacidadLitros": 2400,
  "lat": -34.6037,
  "lng": -58.3816,
  "estado": "NORMAL",
  "nivelLlenadoPct": 0,
  "temperaturaC": null,
  "ultimaLecturaEn": null,
  "activo": true,
  "creadoEn": "2026-08-20T23:38:03.400Z",
  "actualizadoEn": "2026-08-20T23:38:03.400Z"
}
```

Dejar que el backend genere el código te simplifica el formulario: el campo puede ser opcional
y con placeholder "se genera automáticamente".

### `PATCH /contenedores/:id` — editar

Rol: `ADMINISTRADOR`. Mandás **solo los campos que cambian**. Mismas reglas que el alta.
**El `codigo` no se puede modificar** — es el identificador operativo.

```json
{ "capacidadLitros": 2400, "zonaId": "otra-zona-uuid" }
```

Devuelve `200` con el contenedor actualizado.

### `PATCH /contenedores/:id/servicio?fuera=true` — sacar de servicio o reintegrar

Roles: `ADMINISTRADOR`, `OPERADOR`. **El valor va como query param**, igual que el bloqueo de
zonas. Devuelve `200` con el contenedor actualizado.

```
PATCH /api/v1/contenedores/13479ceb.../servicio?fuera=true    → estado: FUERA_DE_SERVICIO
PATCH /api/v1/contenedores/13479ceb.../servicio?fuera=false   → vuelve a servicio
```

**Por qué no viaja en el `PATCH` general.** `estado` no es un campo editable: NORMAL,
ADVERTENCIA y CRITICO los decide el motor de reglas con cada lectura (CU-05), y dejarlos escribir
a mano sería pelearle al motor que los calcula — la próxima lectura pisaría lo que el usuario
puso. `FUERA_DE_SERVICIO` es lo único que decide una persona, y es un acto operativo, no la
edición de un campo. Mismo criterio que el bloqueo de zonas y que el estado del camión.

**Al reintegrarlo NO vuelve a `NORMAL` a ciegas.** Se lo reevalúa contra el umbral de su zona con
el último nivel conocido: un contenedor que quedó al 92% vuelve `CRITICO`, no verde. Devolverlo a
verde lo dejaría además fuera del ruteo, que solo toma críticos.

**Las alertas abiertas no se tocan**, ni al salir ni al volver: el contenedor sigue lleno y esa
alerta es justamente lo que alguien tiene que atender.

**Es idempotente:** pedir dos veces lo mismo devuelve `200` sin cambiar nada.

> **Un límite conocido:** si vuelve a servicio y queda `CRITICO`, *no* se genera una alerta nueva.
> Las alertas se emiten solo en la transición a crítico, y acá el contenedor ya estaba crítico
> antes de salir de servicio — con lo cual su alerta original sigue abierta y no hace falta otra.
> El caso raro es que alguien la haya resuelto a mano mientras estaba fuera de servicio: ahí queda
> rojo en el mapa sin alerta. Es la misma regla que ya documentamos más abajo, no un caso nuevo.

### `DELETE /contenedores/:id` — baja

Rol: `ADMINISTRADOR`. Devuelve **`204` sin cuerpo**.

Es **baja lógica**: el contenedor deja de aparecer en listados y en el mapa, pero la fila
sobrevive porque su histórico de lecturas es la fuente de datos del modelo predictivo.

### `POST /contenedores/:id/sensor` — vincular sensor

Rol: `ADMINISTRADOR`

**Mandás** (`codigo` opcional, se genera `SN-0001`, `SN-0002`... si no lo enviás):

```json
{ "codigo": "SN-CENTRO-01" }
```

o directamente `{}`.

**Respuesta `201`:**

```json
{
  "sensorId": "44571f8b-60a9-4b07-ae49-1c3b7f383828",
  "codigo": "SN-0005",
  "contenedorId": "ca458216-71f0-45e2-b0af-a06ff1c55ed6",
  "apiKey": "6345ff74a912d66db22bb...",
  "advertencia": "Guardala ahora: no se puede volver a consultar."
}
```

> ### Esto sí necesita cuidado en la UI
>
> **La `apiKey` se muestra una única vez.** No se guarda en claro en ningún lado: el backend
> solo conserva su hash. Si el usuario cierra el modal sin copiarla, la única salida es
> desvincular y volver a vincular el sensor.
>
> Tratala como las claves de AWS o los tokens de GitHub: modal explícito, botón de copiar,
> y un aviso claro de que no va a volver a aparecer. **No la metas en una tabla ni en un toast
> que se va solo.**

Si el contenedor ya tiene sensor → `409 CONTENEDOR_YA_TIENE_SENSOR`.

---

## 6. CU-02 · Zonas y umbrales

La zona define **a partir de qué porcentaje** un contenedor de esa zona se considera crítico.
En el centro conviene 70%; en zonas de baja densidad, 85% alcanza.

### `GET /zonas`

Roles: `ADMINISTRADOR`, `OPERADOR`

```json
[
  {
    "id": "63249e42-e2cf-429f-9c54-ffef4b73a1b1",
    "nombre": "Centro",
    "umbralCriticoPct": 70,
    "umbralTemperaturaC": 60,
    "bloqueada": false,
    "creadaEn": "2026-08-20T22:49:05.319Z",
    "actualizadaEn": "2026-08-20T22:49:05.319Z"
  }
]
```

Este endpoint es el que te llena el `<select>` de zonas del formulario de contenedores.

### `GET /zonas/:id`

Roles: `ADMINISTRADOR`, `OPERADOR`. Mismo objeto.

### `POST /zonas`

Rol: `ADMINISTRADOR`

```json
{
  "nombre": "Centro",
  "umbralCriticoPct": 70,
  "umbralTemperaturaC": 60
}
```

| Campo | Reglas |
|---|---|
| `nombre` | 2 a 80 caracteres, **único** |
| `umbralCriticoPct` | Entero de 1 a 100 |
| `umbralTemperaturaC` | Entero de 20 a 150 |

Los tres son obligatorios. Nombre repetido → `409 ZONA_NOMBRE_DUPLICADO`.

### `PATCH /zonas/:id`

Rol: `ADMINISTRADOR`. Solo los campos que cambian.

> Cambiar `umbralCriticoPct` **no recalcula** los contenedores existentes en el acto: cada uno
> se reevalúa con su próxima lectura. Si bajás el umbral de 85 a 70, los contenedores que ya
> deberían estar en rojo tardan hasta el siguiente reporte del sensor en cambiar de color.
> Vale la pena avisarlo en la UI.

### `PATCH /zonas/:id/bloqueo?bloqueada=true`

Roles: `ADMINISTRADOR`, `OPERADOR`. El valor va como **query param**, no en el cuerpo.

Una zona bloqueada queda excluida del ruteo. A partir del Sprint 4 esto se dispara solo al
recibir un incidente del módulo de Emergencias; por ahora es manual.

### `DELETE /zonas/:id`

Rol: `ADMINISTRADOR`. Devuelve `204`.

Falla con `409 ZONA_CON_CONTENEDORES` si todavía tiene contenedores asignados; el `message`
te dice cuántos. Mostralo tal cual, es accionable.

---

## 7. CU-05 y CU-06 · Alertas

### `GET /alertas`

Roles: `ADMINISTRADOR`, `OPERADOR`

**Query params, todos opcionales y combinables:** `contenedorId` (UUID), `tipo`, `severidad`,
`estado`.

**Respuesta `200` — array, ordenado de más reciente a más antigua:**

```json
[
  {
    "id": "fe6dbdf4-488e-4bc8-bbf5-8fcdb8ee06df",
    "contenedorId": "809d697e-05b4-4a4b-a0c2-95289e128cf2",
    "contenedorCodigo": "CT-0007",
    "tipo": "INCENDIO",
    "severidad": "CRITICA",
    "estado": "ABIERTA",
    "detalle": "Temperatura interna 88.5C supera el umbral 60C de la zona Centro",
    "detectadaEn": "2026-09-02T22:33:52.673Z",
    "resueltaEn": null,
    "creadaEn": "2026-09-02T22:33:52.679Z"
  }
]
```

- **`contenedorCodigo` viene en la respuesta.** Ya no hace falta cruzarlo contra el listado de
  contenedores para mostrar `CT-0007` en la tabla.
- `detalle` es texto ya redactado para mostrarle al operador. Usalo tal cual.
- `resueltaEn` es `null` mientras la alerta no esté cerrada.

### `GET /alertas/:id`

Roles: `ADMINISTRADOR`, `OPERADOR`. Mismo objeto.

### `PATCH /alertas/:id/atender`

Roles: `OPERADOR`, `ADMINISTRADOR`. **Sin cuerpo.** Pasa la alerta a `EN_ATENCION`.

Solo funciona si está `ABIERTA`. Si no → `409 ALERTA_NO_ABIERTA`.

### `PATCH /alertas/:id/resolver`

Roles: `OPERADOR`, `ADMINISTRADOR`. **Sin cuerpo.** La cierra y sella `resueltaEn`.

Si ya estaba resuelta → `409 ALERTA_YA_RESUELTA`.

**En la UI:** el botón "Atender" solo tiene sentido en alertas `ABIERTA`, y "Resolver" en
`ABIERTA` o `EN_ATENCION`. Deshabilitalos según el estado en vez de dejar que el usuario
coma un 409.

---

## 8. Las reglas de negocio que te van a confundir si no las sabés

### Las alertas se generan una sola vez, no en cada lectura

Cuando un contenedor cruza el umbral se genera **una** alerta de saturación y se publica un
evento al bus. Si el sensor sigue reportando 81%, 87%, 94% — **no se generan alertas nuevas**.
La alerta existente queda `ABIERTA` y el `nivelLlenadoPct` del contenedor sigue subiendo.

Es a propósito: sin eso, un contenedor saturado generaría una alerta cada 15 minutos.

Para vos significa que **el estado del contenedor y la alerta son dos cosas distintas**. El
mapa muestra el estado actual; el tablero de alertas muestra eventos que alguien tiene que
atender. Un contenedor puede estar en `CRITICO` con su alerta ya `RESUELTA`.

### El incendio no depende del llenado

Un contenedor puede estar al 5% y disparar `INCENDIO` igual: se evalúa solo la temperatura
contra `umbralTemperaturaC` de la zona. En el mapa ese contenedor sigue apareciendo **verde**,
porque `estado` refleja el llenado.

> Vale la pena resolver esto visualmente: un contenedor verde con una alerta de incendio abierta
> es exactamente el caso que no se puede pasar por alto. Un badge o un halo sobre el marcador,
> aparte del color de estado.

### `FUERA_DE_SERVICIO` es pegajoso

Ninguna lectura saca a un contenedor de ese estado: se entra y se sale solo por
`PATCH /contenedores/:id/servicio?fuera=`. Un vaciado confirmado tampoco lo devuelve a `NORMAL`
—lo que tiene roto es el sensor o la tapa, no el nivel— aunque sí le pone el nivel en 0.

### Un contenedor sin sensor nunca cambia

Se queda en `NORMAL` con `nivelLlenadoPct: 0` y `ultimaLecturaEn: null` para siempre. En el
listado conviene distinguirlo de uno que sí reporta y está realmente vacío.

---

## 8a. CU-03 · Gestionar flota

**Implementado y verificado.** ABM de camiones: patente, capacidad y qué tipo de residuo pueden
levantar.

### `GET /camiones`

Roles: `ADMINISTRADOR`, `OPERADOR`. Query opcional: `estado`, `tipoResiduoHabilitado`.

```json
[
  {
    "id": "dd8404c1-2db2-4ad5-8f74-8052bd25d6f9",
    "patente": "AB123CD",
    "capacidadLitros": 18000,
    "tipoResiduoHabilitado": "RECICLABLE",
    "estado": "DISPONIBLE",
    "creadoEn": "2026-09-02T22:47:24.949Z",
    "actualizadoEn": "2026-09-02T22:51:31.461Z"
  }
]
```

### `POST /camiones`

Rol: `ADMINISTRADOR`. Cuerpo: `{ patente, capacidadLitros, tipoResiduoHabilitado }`.

| Campo | Reglas |
|---|---|
| `patente` | 6 a 20 caracteres. **Se normaliza**: `"  ab 123 cd  "` se guarda como `"AB123CD"` |
| `capacidadLitros` | Entero de 1000 a 40000 |
| `tipoResiduoHabilitado` | `COMUN`, `RECICLABLE` u `ORGANICO` |

**`estado` no se acepta en el alta.** Todo camión nace `DISPONIBLE`: no hay ninguna ruta a la que
pertenezca todavía.

Patente repetida → `409 CAMION_PATENTE_DUPLICADA`. La detección es sobre la patente normalizada,
así que `"ab 123 cd"` colisiona con `"AB123CD"`.

### `PATCH /camiones/:id`

Rol: `ADMINISTRADOR`. Solo los campos que cambian.

> ### Una diferencia con tu mock
>
> **`estado` solo acepta `DISPONIBLE` o `MANTENIMIENTO`.** Mandar `EN_RUTA` a mano devuelve `400`.
>
> Tu mock lo permitía. Lo bloqueé porque abría una trampa sin salida: un camión marcado `EN_RUTA`
> sin ruta asociada queda bloqueado —no se le puede cambiar el estado porque está en ruta— y no hay
> ninguna ruta que cerrar para liberarlo. `EN_RUTA` lo fija la asignación de ruta de CU-09.
>
> En el formulario, ofrecé solo esas dos opciones.

Si el camión ya está `EN_RUTA`, cualquier cambio de estado devuelve `409 CAMION_EN_RUTA` — pero
**sí se pueden editar los demás campos**.

### No hay `DELETE`, y es deliberado

Un camión borrado seguiría colgando de las rutas históricas que ejecutó. Para sacarlo de
circulación se lo pasa a `MANTENIMIENTO`. El endpoint no existe: devuelve `404`.

### Errores

| `code` | HTTP | Cuándo |
|---|---|---|
| `CAMION_PATENTE_DUPLICADA` | 409 | Ya hay un camión con esa patente normalizada |
| `CAMION_NO_ENCONTRADO` | 404 | — |
| `CAMION_EN_RUTA` | 409 | Se quiso cambiar el estado de un camión que está en ruta |

---

## 8b. CU-12 · Predicción de saturación

**Implementado y verificado contra la API real.** Estima cuántas horas faltan para que el
contenedor cruce el umbral de su zona.

### `GET /contenedores/:id/prediccion`

Roles: `ADMINISTRADOR`, `OPERADOR`

**Respuesta `200`** — captura real:

```json
{
  "contenedorId": "809d697e-05b4-4a4b-a0c2-95289e128cf2",
  "codigo": "CT-0007",
  "nivelActualPct": 58.45,
  "umbralCriticoPct": 70,
  "tasaLlenadoPctPorHora": 8.02,
  "horasHastaUmbral": 1.44,
  "saturacionEstimadaEn": "2026-09-02T23:51:21.213Z",
  "confianza": 0.997,
  "muestrasUsadas": 25
}
```

| Campo | Qué es |
|---|---|
| `nivelActualPct` | Última lectura del contenedor |
| `umbralCriticoPct` | Umbral de su zona. Se incluye para no tener que pedir la zona aparte |
| `tasaLlenadoPctPorHora` | Pendiente de la recta ajustada. Puntos porcentuales por hora |
| `horasHastaUmbral` | Cuánto falta. **Es `0` si ya lo cruzó**, nunca negativo |
| `saturacionEstimadaEn` | Momento estimado del cruce, en ISO |
| `confianza` | R² del ajuste, entre 0 y 1 |
| `muestrasUsadas` | Cuántas lecturas entraron en la regresión |

### Errores

| `code` | HTTP | Cuándo |
|---|---|---|
| `SIN_LECTURAS_SUFICIENTES` | 409 | Menos de 3 lecturas en el ciclo actual. Un contenedor recién dado de alta cae acá |
| `TENDENCIA_NO_CRECIENTE` | 409 | **Código nuevo.** El contenedor no se está llenando, así que no hay saturación que predecir |
| `CONTENEDOR_NO_ENCONTRADO` | 404 | — |

> `TENDENCIA_NO_CRECIENTE` es un código que no estaba en el contrato original. Se agregó porque
> devolver una fecha de saturación para un contenedor que se está vaciando sería inventar un futuro.
> La tarjeta del frontend ya lo maneja bien: muestra el `message` para los códigos que no conoce.

### Cómo se calcula, para que puedas explicarlo

Regresión lineal por mínimos cuadrados sobre el histórico de lecturas. Dos cosas que conviene saber
porque se ven en pantalla:

1. **Solo se ajusta sobre el ciclo de llenado actual.** Si la ventana de lecturas cruza un vaciado,
   la serie sube, cae a cero y vuelve a subir, y la recta sobre eso no describe nada. Por eso
   `muestrasUsadas` puede ser mucho menor que el total de lecturas del contenedor: verificado con un
   contenedor de 24 lecturas que reportó `muestrasUsadas: 12`, las posteriores al vaciado.
2. **La `confianza` es el R² real del ajuste**, no un número decorativo. Un llenado errático da
   valores por debajo de 0,5, y ahí es correcto mostrar el aviso de no planificar con ese número.

---

## 8c. CU-11 · Consulta ciudadana — **público, sin token**

**Implementado y verificado.** Es el único endpoint del módulo que se sirve sin `Authorization`.

### `GET /publico/contenedores/cercanos`

**Sin autenticación.** Mandá la llamada por `apiPublic`, sin el header — un operador logueado que
abre la vista ciudadana no tiene por qué filtrar su identidad a un endpoint anónimo.

| Param | Obligatorio | Reglas |
|---|---|---|
| `lat` | Sí | Latitud válida |
| `lng` | Sí | Longitud válida |
| `radioMetros` | No | Entero de 1 a 10000. Por defecto **1000** |
| `tipoResiduo` | No | `COMUN`, `RECICLABLE` u `ORGANICO` |

**Respuesta `200`** — array **ordenado por distancia ascendente**, captura real:

```json
[
  {
    "id": "c826c1e9-d11f-4701-b50d-7f50a3fd72d3",
    "codigo": "CT-0009",
    "lat": -34.604717,
    "lng": -58.380911,
    "tipoResiduo": "ORGANICO",
    "distanciaMetros": 129
  }
]
```

Exactamente esos seis campos, siempre. `distanciaMetros` es un entero, calculado en el servidor
por Haversine — verificado contra un cálculo independiente con diferencia menor a medio metro.

### Lo que este endpoint deliberadamente NO devuelve

Ni `estado`, ni `nivelLlenadoPct`, ni `temperaturaC`, ni alertas. Es información operativa interna
del municipio y no tiene por qué estar en una vista anónima. La proyección es campo por campo en el
backend, nunca un spread de la entidad, y **hay un test que falla si algún día se cuela un campo de
más**.

### Dos comportamientos que conviene conocer

- **Los contenedores `FUERA_DE_SERVICIO` no aparecen.** Mandar a alguien caminando hasta un
  contenedor roto es peor que no listarlo. Ojo con la diferencia: se filtra *por* el estado, pero no
  se *expone* el estado. En el mapa del operador ese mismo contenedor sigue apareciendo.
- **Si no hay nada en el radio devuelve `[]`, no un error.** No encontrar contenedores cerca es un
  resultado válido, no un fallo.

### Errores

Solo validación: `400` con el array de `message` habitual si `lat`/`lng` faltan o son inválidas, o
si `radioMetros` se pasa de 10000.

---

## 8d. CU-08, CU-09 y CU-10 · Rutas y recolección

**Implementados y verificados de punta a punta.** Hay un test de integración que recorre el ciclo
completo contra PostgreSQL: contenedor saturado → alerta → ruta → asignación → confirmación del
chofer → contenedor en verde, alerta cerrada y camión liberado.

### `POST /rutas/generar` — CU-08

Roles: `ADMINISTRADOR`, `OPERADOR`. Cuerpo: `{ camionId, zonaId? }`.

Devuelve `201` con la ruta expandida: camión y paradas (cada una con su contenedor).

```json
{
  "id": "...",
  "camionId": "...",
  "camion": { "patente": "AB123CD", "capacidadLitros": 12000, "...": "..." },
  "choferId": null,
  "estado": "PROPUESTA",
  "distanciaEstimadaKm": 1.8,
  "litrosEstimados": 1936,
  "paradas": [
    { "id": "...", "orden": 1, "estado": "PENDIENTE", "confirmadaEn": null,
      "contenedorId": "...", "contenedor": { "codigo": "CT-0001", "...": "..." } }
  ],
  "generadaEn": "...", "asignadaEn": null, "completadaEn": null
}
```

**La ruta nace `PROPUESTA` y el camión sigue `DISPONIBLE`.** Es una propuesta, no un compromiso:
el camión se toma recién al asignar.

Reglas de la heurística, todas verificadas:

- Vecino más cercano desde el depósito, respetando la capacidad del camión
- Solo contenedores `CRITICO` del `tipoResiduoHabilitado` del camión
- **Excluye los ya comprometidos en otra ruta viva** (`PROPUESTA`, `ASIGNADA` o `EN_CURSO`)
- **Excluye las zonas bloqueadas**
- La distancia incluye la vuelta al depósito

Errores: `409 CAMION_NO_DISPONIBLE` · `409 RUTA_SIN_CONTENEDORES` (también cuando hay críticos pero
ninguno entra en la capacidad) · `404 CAMION_NO_ENCONTRADO`.

### `GET /rutas` — listado

Roles: `ADMINISTRADOR`, `OPERADOR`. Query params: `estado`, `camionId`.

Trae el camión pero **no las paradas**. En cambio trae `avance`, que es lo que pediste para poder
mostrar "2 de 3 vaciadas" sin una llamada por fila:

```json
{
  "id": "...",
  "camionId": "...",
  "camion": { "patente": "AB123CD", "...": "..." },
  "choferId": "U000042",
  "estado": "EN_CURSO",
  "distanciaEstimadaKm": 4.2,
  "litrosEstimados": 2904,
  "avance": { "total": 3, "confirmadas": 2, "omitidas": 0, "pendientes": 1 },
  "generadaEn": "...", "asignadaEn": "...", "completadaEn": null
}
```

**`avance` siempre viene, aunque la ruta no tenga paradas** — en ese caso los cuatro valores son
`0`. Nunca es `undefined`, así que podés hacer `ruta.avance.confirmadas` sin preguntar.

Del lado del servidor es **una sola consulta agrupada** para todo el listado, no una por fila.
El detalle (`GET /rutas/:id`) **no trae `avance`**: ahí tenés las paradas enteras y contarlas es
trivial.

### `PATCH /rutas/:id/asignar` — CU-09

Roles: `ADMINISTRADOR`, `OPERADOR`. Cuerpo: `{ choferId }`.

Pasa la ruta a `ASIGNADA`, sella `asignadaEn` y **recién ahí el camión pasa a `EN_RUTA`**.

Errores: `409 RUTA_NO_PROPUESTA` · `404 RUTA_NO_ENCONTRADA`.

> ### Sobre `choferId` — y por qué no existe `GET /choferes`
>
> **No implementé ese endpoint, y no creo que deba implementarlo yo.** Los choferes son usuarios del
> módulo de identidad del Squad 2, no entidades de Residuos. Inventar acá un padrón de choferes
> significaría mantener una copia de sus datos y que se desincronice.
>
> `choferId` es un string libre: el `sub` del JWT del chofer. El backend **no lo valida contra
> ningún padrón**, así que no vas a recibir `CHOFER_NO_ENCONTRADO` — ese código de tu mock no
> existe del lado del servidor.
>
> Por la misma razón la ruta trae `choferId` pero **no un objeto `chofer`**: no tenemos su nombre.
>
> Hay que decidirlo en equipo con Nicolás y Adriel. Las opciones que veo: pedirle al Squad 2 un
> endpoint de usuarios por rol, o que el operador escriba el identificador a mano. Mientras tanto
> tu `<select>` puede seguir con datos falsos, y la pantalla ya aclara que es una limitación
> conocida.

### `GET /rutas/:id` — detalle

Roles: `ADMINISTRADOR`, `OPERADOR`. **Ya no acepta `CHOFER`.**

Devuelve cualquier ruta por id y **no verifica de quién es**, así que dejarlo abierto al chofer
permitía que uno leyera la ruta de otro con solo conocer el id. El chofer tiene `/rutas/mias`, que
resuelve la identidad desde el token. Si tu pantalla del chofer llegara a pegarle a este endpoint,
va a recibir `403`: usá `/rutas/mias`.

No trae `avance`: acá tenés las paradas enteras y contarlas es trivial.

### `GET /rutas/mias` — CU-10

Rol: `CHOFER`. **Sin parámetros:** la identidad sale del `sub` del token. Si viajara por query
string, cualquier chofer podría leer la ruta de otro.

Devuelve la ruta expandida, o **cuerpo vacío con `200`** si no tiene ninguna activa. Tu
`client.js` hace `response.json().catch(() => null)`, así que te llega `null` — que es exactamente
lo que asumiste. Terminar el turno no es un error.

### `PATCH /paradas/:id/confirmar` — CU-10

Rol: `CHOFER`. Cuerpo: `{ lat, lng }`.

Devuelve la transición completa, tal como la propusiste:

```json
{
  "paradaId": "...",
  "estado": "CONFIRMADA",
  "confirmadaEn": "...",
  "contenedorId": "...",
  "estadoContenedor": "NORMAL",
  "nivelLlenadoPct": 0,
  "alertasCerradas": 1,
  "rutaEstado": "EN_CURSO",
  "distanciaMetros": 0
}
```

> **Una diferencia con tu mock:** `alertasCerradas` es un **número**, no un array de ids. El id de
> una alerta ya cerrada no le sirve a la pantalla, y devolverlo obligaba a cargar entidades enteras
> solo para descartarlas.

Reglas:

- **Radio de 100 m**, configurable por entorno. Fuera de radio → `403 PARADA_FUERA_DE_RADIO`, y el
  mensaje dice a cuántos metros estás.
- **Un chofer solo confirma paradas de su propia ruta** → `403 PARADA_DE_OTRA_RUTA`. Es un código
  nuevo que tu mock no tenía.
- Doble confirmación → `409 PARADA_YA_CONFIRMADA`.
- El contenedor vuelve a `NORMAL` y 0%, **salvo que esté `FUERA_DE_SERVICIO`**: lo que tiene roto
  es el sensor o la tapa, no el nivel.
- **La primera confirmación pasa la ruta a `EN_CURSO`; la última la cierra y libera el camión.**
  Sin eso el camión quedaría `EN_RUTA` para siempre, y CU-03 no deja sacarlo de ese estado a mano.

### `PATCH /paradas/:id/omitir` — CU-10

Rol: `CHOFER`. Cuerpo: `{ motivo }`. **El motivo es obligatorio** (3 a 200 caracteres); sin él
devuelve `400`.

Es el otro final de una parada, y hasta ahora no existía: el chofer llegó y **no pudo vaciar**
—auto mal estacionado, calle cortada—. Sin esto, esa parada quedaba `PENDIENTE` para siempre, y
como la ruta solo se cierra cuando no queda ninguna pendiente, la ruta quedaba trabada en
`EN_CURSO` y el camión tomado sin forma de recuperarlo.

```json
{
  "paradaId": "...",
  "estado": "OMITIDA",
  "omitidaEn": "2026-09-03T18:22:10.500Z",
  "motivo": "Auto mal estacionado tapando el contenedor",
  "contenedorId": "...",
  "estadoContenedor": "CRITICO",
  "nivelLlenadoPct": 88,
  "rutaEstado": "EN_CURSO"
}
```

Las tres diferencias con `confirmar`, todas deliberadas:

- **No toca el contenedor.** Sigue lleno y en `CRITICO`. Vaciarlo porque el chofer no pudo llegar
  sería mostrar en verde justo el que nadie recolectó.
- **No cierra las alertas.** Por eso la respuesta no trae `alertasCerradas`: esa ausencia es el
  punto. La alerta sigue abierta porque el problema sigue ahí.
- **No exige estar dentro de los 100 m.** El caso típico es no poder acercarse. Pedirle estar al
  lado para declarar que no pudo llegar sería una contradicción.

Lo que sí comparte: **avanza la ruta igual que una confirmación.** Si es la última parada abierta,
la ruta pasa a `COMPLETADA` y el camión vuelve a `DISPONIBLE`.

> **Una parada cerrada no se reabre.** Ni confirmada ni omitida: los dos casos devuelven `409`.
> Si el auto se movió y ahora sí se puede vaciar, se genera una ruta nueva. Reabrirla obligaría a
> revivir una ruta que ya pasó a `COMPLETADA` y a volver a tomar un camión que ya se liberó.

### Códigos nuevos

| `code` | HTTP | Cuándo |
|---|---|---|
| `RUTA_NO_ENCONTRADA` | 404 | — |
| `RUTA_NO_PROPUESTA` | 409 | Se quiso asignar una ruta que ya no es propuesta |
| `RUTA_SIN_CONTENEDORES` | 409 | No hay críticos ruteables para ese camión |
| `CAMION_NO_DISPONIBLE` | 409 | El camión está en ruta o en mantenimiento |
| `PARADA_NO_ENCONTRADA` | 404 | — |
| `PARADA_YA_CONFIRMADA` | 409 | — |
| `PARADA_FUERA_DE_RADIO` | 403 | El chofer está a más de 100 m |
| `PARADA_DE_OTRA_RUTA` | 403 | **Nuevo.** La parada no pertenece a la ruta activa del chofer |
| `PARADA_YA_OMITIDA` | 409 | **Nuevo.** La parada ya se había omitido; no se reabre |

---

## 9. CU-04 · Lecturas — para entender, no para llamar

**Este endpoint no lo vas a usar desde el frontend.** Lo llaman los sensores. Te lo documento
para que entiendas de dónde salen los datos que ves cambiar.

`POST /lecturas` se autentica con el header `X-Sensor-Key`, no con JWT: un sensor es un
dispositivo, no una persona con sesión.

Recibe nivel, temperatura y batería, y devuelve la transición:

```json
{
  "lecturaId": "c3298a7c-23d0-433a-aa18-6dd9dcc1e506",
  "contenedorId": "ca458216-71f0-45e2-b0af-a06ff1c55ed6",
  "estadoAnterior": "NORMAL",
  "estadoNuevo": "CRITICO",
  "alertasGeneradas": ["SATURACION"]
}
```

Cada vez que el simulador manda una de estas, el mapa cambia. Por eso `npm run saturacion`
es la forma más rápida de probar tu UI sin esperar.

---

## 10. Lo que todavía NO existe

Para que no lo esperes ni lo mockees pensando que ya está:

| CU | Qué falta | Cuándo |
|---|---|---|
| — | WebSocket para el mapa. Por ahora, polling | Sprint 5 si hay tiempo |

Los contratos preliminares de todos están en
[api-preliminar.md](api-preliminar.md). Son borradores: cuando los implemente, este documento
se actualiza con la captura real.

---

## Si algo no cierra

Si un contrato no te sirve, te falta un campo, o preferirías recibir los datos de otra forma
—por ejemplo el código del contenedor dentro de la alerta para no tener que cruzarlo—
**decímelo antes de que lo dé por cerrado**. Cambiarlo ahora es gratis; en septiembre, con el
resto de los squads consumiendo nuestros eventos, no.
