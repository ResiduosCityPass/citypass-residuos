# API REST preliminar — Squad 4 · Residuos

Base: `/api/v1` · Documentación viva en `http://localhost:3000/docs` (Swagger).

Toda ruta requiere `Authorization: Bearer <jwt>` salvo las marcadas como **público**.
Ver la matriz completa en [ADR-005](../adr/ADR-005-seguridad-identidad.md).

## CU-01 · Contenedores y sensores

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/contenedores` | Admin | Alta con ubicación, tipo de residuo, capacidad y zona |
| `GET` | `/contenedores` | Admin, Operador | Listado con filtros `?zonaId=&tipoResiduo=&estado=` |
| `GET` | `/contenedores/:id` | Admin, Operador | Detalle con última lectura y alertas abiertas |
| `PATCH` | `/contenedores/:id` | Admin | Edición |
| `DELETE` | `/contenedores/:id` | Admin | Baja lógica |
| `POST` | `/contenedores/:id/sensor` | Admin | Vincula un sensor y **devuelve la API key una única vez** |

## CU-02 · Zonas y umbrales

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/zonas` | Admin |
| `GET` | `/zonas` | Admin, Operador |
| `PATCH` | `/zonas/:id` | Admin |
| `PATCH` | `/zonas/:id/bloqueo?bloqueada=true` | Admin, Operador |
| `DELETE` | `/zonas/:id` | Admin |

Cuerpo: `{ nombre, umbralCriticoPct, umbralTemperaturaC }`.

`DELETE` responde `409 ZONA_CON_CONTENEDORES` si la zona todavía tiene contenedores asignados.

## CU-03 · Flota

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/camiones` | Admin |
| `GET` | `/camiones` | Admin, Operador |
| `PATCH` | `/camiones/:id` | Admin |

## CU-04 · Ingesta de lecturas

| Método | Ruta | Auth |
|---|---|---|
| `POST` | `/lecturas` | `X-Sensor-Key` |

```json
{
  "nivelLlenadoPct": 87.4,
  "temperaturaC": 22.1,
  "bateriaPct": 64,
  "registradaEn": "2026-09-15T14:32:10.482Z"
}
```

> **El cuerpo no lleva `sensorId`.** La identidad del sensor sale de la API key del
> header, no del payload. Si viniera en el cuerpo, un sensor podria reportar lecturas
> en nombre de otro con solo cambiar un campo.

Es el endpoint más caliente del módulo. Al recibir la lectura: la valida contra la anterior,
la persiste, actualiza el sensor y el contenedor, y dispara la evaluación de reglas de CU-05 y CU-06.

Devuelve la transición para que el llamador sepa qué pasó:

```json
{
  "lecturaId": "...",
  "contenedorId": "...",
  "estadoAnterior": "NORMAL",
  "estadoNuevo": "CRITICO",
  "alertasGeneradas": ["SATURACION"]
}
```

> **Pendiente Sprint 2:** envolver los guardados en una transacción y publicar vía tabla
> `outbox` con reintentos. Hoy la publicación es directa: si el driver de eventos falla, la
> lectura queda persistida y el estado actualizado igual —que es el comportamiento correcto—
> pero el evento se pierde en vez de reintentarse.

**Respuestas:** `202 Accepted` · `400` lectura fuera de rango · `401` API key inválida ·
`404` sensor inexistente · `409` lectura duplicada o con timestamp anterior a la última registrada.

## CU-05 / CU-06 · Alertas

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/alertas` | Admin, Operador | Filtros `?tipo=&severidad=&estado=` |
| `PATCH` | `/alertas/:id/atender` | Operador |
| `PATCH` | `/alertas/:id/resolver` | Operador |

## CU-07 · Mapa en tiempo real

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/mapa/contenedores` | Admin, Operador |

Payload liviano pensado para renderizar marcadores: `id`, `lat`, `lng`, `estado`, `tipoResiduo`,
`nivelLlenadoPct`. Filtros `?zonaId=&tipoResiduo=&soloAlertas=true`.

> Para el Hito 1 el mapa refresca por *polling* cada 30s. La actualización push por WebSocket
> queda como mejora del Sprint 5, si hay tiempo.

## CU-08 / CU-09 · Rutas

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/rutas/generar` | Operador | Devuelve una ruta en estado `PROPUESTA`, no la persiste como asignada |
| `PATCH` | `/rutas/:id/asignar` | Operador | Confirma, asigna chofer y pasa a `ASIGNADA` |
| `GET` | `/rutas/:id` | Admin, Operador, Chofer |
| `GET` | `/rutas/mias` | Chofer | Ruta activa del chofer autenticado |

La separación entre generar y asignar es deliberada: **mantiene a una persona en el medio**, que es
exactamente lo que pide CU-09 por si la heurística propone algo absurdo.

## CU-10 · Confirmar vaciado

| Método | Ruta | Rol |
|---|---|---|
| `PATCH` | `/paradas/:id/confirmar` | Chofer |

Cuerpo: `{ "lat": -34.61, "lng": -58.39 }`. Se valida que el chofer esté dentro de un radio
configurable del contenedor (por defecto 100 m). Devuelve el contenedor a `NORMAL`, cierra las
alertas de saturación abiertas y publica `residuos.contenedor.vaciado`.

**Respuestas:** `200` · `403` fuera del radio permitido · `409` parada ya confirmada.

## CU-11 · Consulta ciudadana — **público**

| Método | Ruta | Auth |
|---|---|---|
| `GET` | `/publico/contenedores/cercanos` | Ninguna |

Query: `?lat=&lng=&radioMetros=1000&tipoResiduo=RECICLABLE`.
Resuelto con fórmula de Haversine. No expone estado de llenado ni alertas: es información
operativa interna.

## CU-12 · Predicción de saturación

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/contenedores/:id/prediccion` | Admin, Operador |

```json
{
  "contenedorId": "CT-0421",
  "nivelActualPct": 62.3,
  "tasaLlenadoPctPorHora": 3.1,
  "horasHastaUmbral": 2.5,
  "saturacionEstimadaEn": "2026-09-15T17:00:00.000Z",
  "confianza": 0.87,
  "muestrasUsadas": 96
}
```

## Manejo de errores

Formato uniforme vía filtro global de excepciones, alineado con la dimensión 4 de la rúbrica:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "La parada RT-2026-09-15-03/4 ya fue confirmada",
  "code": "PARADA_YA_CONFIRMADA",
  "timestamp": "2026-09-15T16:05:22.100Z",
  "path": "/api/v1/paradas/PD-0004/confirmar"
}
```

El campo `code` es un identificador estable pensado para que el frontend ramifique sin parsear
el mensaje en castellano.
