# Contratos de eventos — Squad 4 · Residuos

> Estado: **borrador**. Los nombres de tópico y el formato de sobre deben acordarse con el Squad 1
> (dueño del bus) antes del Sprint 3. Ver [ADR-003](../adr/ADR-003-integracion-event-bus.md).

## Convención de nombres

Siguiendo la convención del enunciado (`reclamos.creado`, `movilidad.bici.devuelta`):

```
residuos.<entidad>.<accion>
```

## Sobre común

Todo evento que publicamos viaja con esta envoltura. Los campos de metadata permiten a los
consumidores deduplicar y trazar sin depender del orden de llegada.

```json
{
  "eventId": "3f9c1e6a-...",
  "eventType": "residuos.contenedor.critico",
  "occurredAt": "2026-09-15T14:32:10.482Z",
  "source": "residuos-service",
  "version": 1,
  "correlationId": "8b2d...",
  "payload": { }
}
```

- `eventId` — UUID v4. Único por evento. **Los consumidores deben deduplicar por este campo**:
  asumimos entrega *at-least-once*.
- `version` — versión del esquema del `payload`. Se incrementa ante cambios incompatibles;
  los cambios compatibles (agregar campos opcionales) no la modifican.
- `correlationId` — permite seguir una cadena causal a través de varios módulos. Si un evento se
  emite como consecuencia de otro, se propaga el mismo valor.

---

## Eventos que PUBLICAMOS

### `residuos.contenedor.critico` — CU-05

Se emite cuando una lectura hace que el nivel de llenado supere el umbral de la zona.
**Solo se emite en la transición** `NORMAL → CRITICO`; si el contenedor ya estaba crítico no se
vuelve a emitir, para no inundar a los consumidores con alertas duplicadas.

```json
{
  "contenedorId": "CT-0421",
  "zonaId": "ZN-CENTRO",
  "tipoResiduo": "RECICLABLE",
  "nivelLlenado": 87.4,
  "umbralConfigurado": 70,
  "ubicacion": { "lat": -34.6118, "lng": -58.3960 },
  "detectadoEn": "2026-09-15T14:32:10.482Z"
}
```

**Consumidores esperados:** Analítica Urbana (Squad 8) para dashboards; Reclamos (Squad 5) para
correlacionar con quejas vecinales de contenedores desbordados.

---

### `residuos.incendio.detectado` — CU-06

Alerta de máxima prioridad. Se emite cuando la temperatura interna supera el umbral de seguridad.

```json
{
  "contenedorId": "CT-0421",
  "zonaId": "ZN-CENTRO",
  "temperaturaCelsius": 78.2,
  "umbralConfigurado": 60,
  "ubicacion": { "lat": -34.6118, "lng": -58.3960 },
  "severidad": "CRITICA",
  "detectadoEn": "2026-09-15T14:32:10.482Z"
}
```

**Consumidor principal:** Emergencias y Seguridad (Squad 6). Este es nuestro punto de integración
transversal más valioso: dispara un incidente en su módulo sin ninguna llamada sincrónica.

---

### `residuos.contenedor.vaciado` — CU-10

Se emite cuando el chofer confirma la parada y el contenedor vuelve a estado normal.

```json
{
  "contenedorId": "CT-0421",
  "rutaId": "RT-2026-09-15-03",
  "camionId": "CM-07",
  "choferId": "U000042",
  "nivelPrevio": 87.4,
  "confirmadoEn": "2026-09-15T16:05:22.100Z"
}
```

**Consumidores esperados:** Analítica Urbana (Squad 8), para métricas de tiempo de respuesta.

---

### `residuos.parada.omitida` — CU-10

Se emite cuando el chofer llega pero no puede vaciar. El contenedor **queda como estaba**: sigue
lleno y con su alerta abierta.

```json
{
  "paradaId": "b1f0...",
  "rutaId": "RT-2026-09-15-03",
  "contenedorId": "CT-0421",
  "camionId": "CM-07",
  "choferId": "U000042",
  "motivo": "Auto mal estacionado tapando el contenedor",
  "nivelLlenadoPct": 88,
  "omitidaEn": "2026-09-15T16:12:40.900Z"
}
```

**Consumidores esperados:** Analítica Urbana (Squad 8), para medir cuántas recolecciones se
pierden y por qué. Es el dato que justifica cambiar un horario o una frecuencia de recorrido.

---

### `residuos.intervencion.programada` — CU-01 de Emergencias (alternativa A7)

Se emite cuando Emergencias resuelve un incidente y **`causasRelacionadas` incluye `RESIDUOS`**
(un contenedor en la ciclovía, residuos en la calzada). Con cualquier otra causa (`VIA`,
`ESPACIO_PUBLICO`) no se emite nada. Sale al bus como `IntervencionProgramada`.

```json
{
  "intervencionId": "a3f1c2d4-7b5e-4a90-8c11-2e6d9f0b7a15",
  "emergenciaId": "EMG-20261008-0091",
  "contenedorId": "ct-01",
  "latitud": -34.6037,
  "longitud": -58.3816,
  "programadaEn": 1791486321000,
  "correlationId": "EMG-20261008-0091",
  "occurredAt": 1791486321000
}
```

`programadaEn` y `occurredAt` van en **epoch milisegundos** (lo que lee Analítica). `contenedorId` es `null` si no había ningún contenedor a menos de 50 m (radio configurable con
`INTEGRACION_RADIO_INTERVENCION_METROS`): la intervención se programa igual. Si había uno, además
se crea un refuerzo interno para que entre en la próxima ruta. **No se publica `RefuerzoProgramado`**: ese evento alimenta el dashboard de eventos de Analítica y un refuerzo por emergencia no es de ningún evento comunitario.

`correlationId` es el `emergenciaId`, para que EDA pueda seguir la cadena completa.

**Consumidores esperados:** EDA (Squad 1) para verificar el flujo; Analítica Urbana (Squad 8), que solo lee eventos y arma gráficos, no publica nada.

### `residuos.intervencion.completada` — CU-01 de Emergencias (A7)

Se emite cuando el operador marca la intervención como completada (`PATCH /intervenciones/:id/completar`). Está en el catálogo del CU-01 (versión del 29/10). Sale al bus como `IntervencionCompletada`; esquema en [`schemas/IntervencionCompletada.avsc`](schemas/IntervencionCompletada.avsc).

```json
{
  "intervencionId": "a3f1c2d4-7b5e-4a90-8c11-2e6d9f0b7a15",
  "emergenciaId": "EMG-20261008-0091",
  "completadaEn": 1791489600000,
  "correlationId": "EMG-20261008-0091",
  "occurredAt": 1791489600000
}
```

Una intervención completada no se reabre (`409 INTERVENCION_YA_COMPLETADA`).

El esquema Avro para registrarlo en la consola de EDA está en [`schemas/IntervencionProgramada.avsc`](schemas/IntervencionProgramada.avsc). **Lo registra Residuos, no EDA**; sin eso el gateway devuelve 404.

---

### `residuos.reclamo.evaluado` — CU-INT-02

Sale al bus como **`com.citypass.residuos.ReclamoEvaluado`**. Se emite **cada vez que Residuos
decide** si un auto denunciado en un reclamo tapa algún contenedor, afecte o no. Es la respuesta a
Reclamos y, a la vez, el dato de la métrica para BI.

```json
{
  "reclamoId": "RC-123",
  "afectaRecoleccion": true,
  "contenedoresAfectados": [{ "codigo": "CT-0421", "distanciaMetros": 8.4 }],
  "rutasRecalculadas": ["b1f0..."],
  "correlationId": "req-7c9e6679",
  "occurredAt": 1792692000000
}
```

| Campo | Qué es |
|---|---|
| `reclamoId` | Id del reclamo en el módulo de Reclamos. **Es la clave para contar** |
| `afectaRecoleccion` | `true` si el auto tapa al menos un contenedor (a `OBSTRUCCION_RADIO_METROS`, 15 m). `false` si no tapa ninguno |
| `contenedoresAfectados` | Los contenedores tapados, con la distancia al auto. Vacío si `afectaRecoleccion` es `false` |
| `rutasRecalculadas` | Rutas vivas que perdieron una parada por este reclamo. Vacío si ninguna ruta tenía esos contenedores |
| `correlationId` | El que mandó Reclamos en su evento, para seguir el reclamo de punta a punta. `null` si no vino |
| `occurredAt` | Momento de la decisión, **en milisegundos desde epoch** (no ISO, a diferencia de los eventos anteriores): es lo que lee Analítica y lo que recomendó EDA para los eventos nuevos. Es la fecha para agrupar por período |

**Consumidores esperados:**
- **Reclamos (Squad 5):** para saber si el reclamo afectó la recolección (por ahora no lo consumen).
- **Analítica Urbana (Squad 8):** para la métrica de abajo.

#### Métrica para BI: porcentaje de reclamos que bloquean un contenedor

```
% reclamos que bloquean = reclamos distintos con afectaRecoleccion = true
                          ─────────────────────────────────────────────── × 100
                                  reclamos distintos evaluados
```

- **Se cuenta por `reclamoId` distinto, no por evento.** El bus entrega *at least once*, y
  Reclamos puede reenviar el mismo reclamo con otro `eventId`: en los dos casos llega más de un
  `ReclamoEvaluado` con el mismo `reclamoId`. Si llegan dos decisiones distintas para el mismo
  reclamo, vale la primera según `occurredAt`.
- **El período se agrupa por `occurredAt`.**
- **El universo son los reclamos que Residuos evalúa:** los de estacionamiento indebido (o sin
  categoría) que traen una ubicación válida. Los que se ignoran por no ser de estacionamiento, o por
  no traer coordenadas, no generan evento y no entran en el denominador.
- **Lectura complementaria:** con `rutasRecalculadas` no vacío se puede sacar, además, el
  porcentaje de reclamos que rompieron una ruta que ya estaba armada.

> **Lo registra Residuos, no EDA:** desde la consola del gateway, en el catálogo de tipos, con el
> esquema Avro de [`schemas/ReclamoEvaluado.avsc`](schemas/ReclamoEvaluado.avsc). El namespace sale
> del token del grupo. Mientras no esté registrado, el gateway responde 404 y el evento queda
> `FALLIDO` en el outbox.

---

### `residuos.refuerzo.programado` — CU-INT-01 y squad 3

Se publica cuando se programa un refuerzo de recolección. En el bus sale como
`com.citypass.residuos.RefuerzoProgramado`.

```json
{
  "refuerzoId": "refuerzo-act-3f1c2a9e",
  "eventoId": "act-3f1c2a9e",
  "zona": "",
  "contenedores": 2,
  "programadoPara": "2026-11-01T20:00:00.000Z",
  "occurredAt": "2026-11-01T14:30:00.000Z"
}
```

| Campo | Para qué sirve |
|---|---|
| `refuerzoId` | Id del refuerzo. Clave para contar: puede repetirse en más de un evento |
| `eventoId` | Evento que lo originó. Con el prefijo `act-` viene de una actividad masiva del squad 3 |
| `zona` | Zona del evento. Vacía en las actividades masivas, porque `ActividadCreada` no la trae |
| `contenedores` | Cantidad de contenedores reforzados |
| `programadoPara` | Cuándo arranca el refuerzo. En el squad 3 es la hora de fin de la actividad |
| `occurredAt` | Cuándo se programó, en ISO-8601 |

**Consumidores esperados:** Analítica Urbana (Squad 8), para la métrica de abajo.

#### Métrica para BI: actividades masivas con refuerzo (a confirmar con Analítica)

```
actividades masivas con refuerzo = refuerzoId distintos con eventoId que empieza con "act-"
contenedores reforzados por actividad = contenedores de cada uno de esos refuerzos
```

- **Se cuenta por `refuerzoId` distinto, no por evento:** una actividad entregada de nuevo con otro
  `eventId` publica otro `RefuerzoProgramado` con el mismo `refuerzoId`.
- **Una actividad sin contenedores a 300 m no publica nada:** no se puede sacar un porcentaje sobre
  el total de actividades masivas con este evento.

> **Lo registra Residuos:** desde la consola del gateway, con el esquema Avro de
> [`schemas/RefuerzoProgramado.avsc`](schemas/RefuerzoProgramado.avsc). Mientras no esté registrado,
> el gateway responde 404 y el evento queda `FALLIDO` en el outbox.

---

### `residuos.intervencion.actualizada` — CU-INT-01

Sale al bus como **`com.citypass.residuos.IntervencionActualizada`**. Se emite **una vez por parada**
cuando llega una `EmergenciaCreada` con `afectaCirculacion: true` y un contenedor a menos de 300 m
tiene una parada pendiente en una ruta `ASIGNADA` o `EN_CURSO`. Esa parada queda `OMITIDA` y la ruta
se recalcula. En una ruta `PROPUESTA` la parada se borra sin publicar nada: el camión no salió.

```json
{
  "intervencionId": "9c4e2a1b-6d8f-4b3a-a7e5-1f0d3c8b6e21",
  "camionId": "AB123CD",
  "estadoAnterior": "PROGRAMADA",
  "estadoNuevo": "AFECTADA",
  "causaId": "a3c9e5f1-7b2d-4d8e-b6a0-9f1c2e3d4b55",
  "causaTipo": "INCIDENTE_VIAL",
  "correlationId": "c-5521",
  "updatedAt": "2026-11-16T02:40:00.000Z"
}
```

#### Métrica para BI: cuadrillas afectadas por incidentes viales (caso 4)

```text
camionId distintos con estadoNuevo = AFECTADA y causaTipo = INCIDENTE_VIAL
```

- **`intervencionId` es el id de la parada:** para Analítica, cada parada es una intervención. Con
  esa misma lectura, contar eventos da las paradas afectadas. No coincide con el `intervencionId` de
  `IntervencionProgramada`, que es uno por emergencia: esta métrica no los cruza.
- **`causaId` y `causaTipo` son los de `EmergenciaCreada`:** si no vienen los dos, salen en `null` y
  el evento no suma a la métrica, aunque la parada se omita igual.
- **`updatedAt` va en ISO-8601**, como pide el contrato de Analítica del 29/10, y no en milisegundos
  como `ReclamoEvaluado`.

> **Lo registra Residuos, no EDA:** desde la consola del gateway, en el catálogo de tipos, con el
> esquema Avro de [`schemas/IntervencionActualizada.avsc`](schemas/IntervencionActualizada.avsc).
> Mientras no esté registrado, el gateway responde 404 y el evento queda `FALLIDO` en el outbox.

---

### `residuos.ruta.recalculada` — CU-INT-02 · solo interno

No sale al bus: lo usa nuestro front, que lo ve por la API. Ver
`docs/sprints/integracion-reclamos-backend.md`.

---

### `residuos.ruta.generada` — CU-08

```json
{
  "rutaId": "RT-2026-09-15-03",
  "camionId": "CM-07",
  "cantidadParadas": 14,
  "distanciaEstimadaKm": 23.7,
  "cargaEstimadaLitros": 4200,
  "generadaEn": "2026-09-15T15:00:00.000Z"
}
```

---

## Eventos a los que NOS SUSCRIBIMOS

| Evento | Squad origen | Qué hacemos al recibirlo |
|---|---|---|
| `emergencias.incidente.creado` | 6 — Emergencias | Si el incidente ocurre dentro de una zona, marcamos la zona como bloqueada y sus contenedores quedan excluidos del ruteo de CU-08. |
| `emergencia.resuelta` (el del CU-01), `EmergenciaCerrada`, `EmergenciaResuelta`, y `EmergenciaEstadoActualizado` / `EmergenciaActualizada` con estado `RESUELTA` o `CERRADA` | 6 — Emergencias | Además de desbloquear las zonas, si `causasRelacionadas` incluye `RESIDUOS` programamos una intervención en `ubicacion` y publicamos `residuos.intervencion.programada`. El backend de Emergencias publica hoy `EmergenciaEstadoActualizado` y `EmergenciaCerrada`; su CU-01 documenta `emergencia.resuelta`. Se aceptan todas las variantes (el campo del estado puede llamarse `estadoNuevo`, `estado` o `nuevoEstado`). |
| `movilidad.calle.cortada` | 3 — Movilidad Urbana | Se excluye el tramo del cálculo de ruta. Si la ruta ya estaba asignada, se marca para recálculo. |
| `reclamos.creado` | 5 — Reclamos Ciudadanos | Si la categoría es residuos y referencia un contenedor nuestro, se le adjunta el reclamo y se eleva su prioridad en el ruteo. |
| `com.citypass.reclamos.ReclamoCreado` (o variantes) | 5 — Reclamos Ciudadanos | **CU-INT-02, implementado.** Si es de estacionamiento indebido y el auto tapa un contenedor, lo sacamos del ruteo, recalculamos las rutas vivas y publicamos `ReclamoEvaluado`. Las variantes aceptadas están en `contrato-reclamos.ts` |
| `com.citypass.reclamos.ReclamoActualizado` con `estadoNuevo: RESUELTO` (o variantes) | 5 — Reclamos Ciudadanos | **CU-INT-02, implementado.** Destapamos los contenedores del reclamo. También si queda rechazado o cancelado. Si nadie avisa, el bloqueo vence solo |
| `com.citypass.reclamos.ReclamoReclasificado` (implementado por Reclamos, falta registrarlo en el catálogo) | 5 — Reclamos Ciudadanos | **CU-INT-02, implementado.** Si con la categoría nueva es un auto mal estacionado, se evalúa como un reclamo nuevo; si deja de serlo, se liberan sus contenedores. Para decidir si es un vehículo usamos el título y la descripción; `objetoAfectadoNuevo` solo suma (`CICLOVIA` alcanza) y nunca descarta, porque nombra lo afectado y lo elige el vecino |

### Lo que necesitamos de Emergencias para el CU-01 (A7)

El CU-01 (versión del 29/10) define **`emergencia.resuelta`** con `causasRelacionadas` y `ubicacion`, y quitó las solicitudes con confirmación. Pero al 29/10 el backend de Emergencias publica `EmergenciaEstadoActualizado` y `EmergenciaCerrada`, y **ninguno trae `causasRelacionadas` ni `ubicacion`**: sin eso Residuos no puede saber si actuar ni dónde. Mínimo que pedimos, sin inventar un evento nuevo, en `EmergenciaCerrada` (o en `emergencia.resuelta`, como dice su CU-01):

```json
{
  "emergenciaId": "EMG-20261008-0091",
  "causasRelacionadas": ["RESIDUOS"],
  "ubicacion": { "lat": -34.6037, "lng": -58.3816 }
}
```

El prototipo del caso mostraba un evento `emergencia.solicitud.residuos` con un `solicitudId`; la versión del 29/10 del CU-01 ya no lo menciona y se descartó.

**Decidido el 30/10 con Analítica:** `RefuerzoProgramado` **no se publica** desde la intervención. El CU-01 lo listaba para A7, pero Analítica (G8) no lo necesita —sale del mismo `contenedorId` de la intervención— y ese evento alimenta su dashboard de eventos de Espacios. Se saca del doc del caso. El refuerzo sigue existiendo como mecanismo interno de ruteo.

> Estos tres nombres son **supuestos**, derivados de la descripción de cada módulo en el enunciado.
> Hay que confirmarlos con cada squad durante el Sprint 3, que es la instancia donde la cátedra
> planifica el diseño colaborativo de casos de uso transversales.

### `com.citypass.espacios.ActividadCreada` — caso transversal del squad 3

**Caso:** "Recolección inteligente después de un evento masivo". Termina un evento grande en una
plaza y Residuos manda una escuadrilla a limpiar los contenedores de la zona.

**Quién lo publica:** Espacios Públicos, cada vez que se crea una actividad o evento comunitario.
Internamente lo emiten como `cultura.evento_comunitario_publicado` y, al publicarlo en el bus, lo
mapean a este nombre y a los campos del contrato del squad (E1 en
[plan-squad-3.md](../sprints/plan-squad-3.md)). Rodrigo lo confirmó en el grupo del squad: así
Residuos, Reclamos, Emergencias y Movilidad consumen todos lo mismo.

**Cómo llega:** por el webhook `POST /webhooks/citypass?token=...` (CU-INT-01), con el sobre del
gateway `{ metadata: { eventId, eventType }, data }`. Se descartan repetidos por
`metadata.eventId`.

```json
{
  "metadata": {
    "eventId": "7c1e...",
    "eventType": "com.citypass.espacios.ActividadCreada"
  },
  "data": {
    "correlationId": "act-3f1c2a9e-0000-4000-8000-000000000001",
    "actividadId": "3f1c2a9e-0000-4000-8000-000000000001",
    "titulo": "Festival de Primavera",
    "estado": "PROGRAMADA",
    "capacidad": 5000,
    "fechaHoraInicio": 1793559600000,
    "fechaHoraFinalizacion": 1793577600000,
    "ubicacion": { "lat": -34.6037, "lng": -58.3816 },
    "direccion": "Av. 9 de Julio 1000",
    "espacioNombre": "Plaza de la República",
    "actorSub": null
  }
}
```

| Campo | Tipo | Uso en Residuos |
|---|---|---|
| `actividadId` | UUID | Id de la actividad |
| `titulo` | string | Se muestra en el mapa |
| `capacidad` | entero | Corte de evento masivo |
| `estado` | string | Siempre `PROGRAMADA`. Si algún día llega `CANCELADA`, se ignora |
| `fechaHoraInicio`, `fechaHoraFinalizacion` | milisegundos (epoch, UTC) | La zona se muestra hasta 6 h después del fin; la escuadrilla arranca en el fin |
| `ubicacion` | `{ lat, lng }`, WGS84 | Centro de la zona |

`correlationId`, `direccion`, `espacioNombre` y `actorSub` vienen en el evento, pero Residuos no
los usa. Si falta el id, la ubicación o una fecha en milisegundos, el evento se ignora y queda en
el log.

**Qué hacemos al recibirlo** (`ActividadesMasivasService`):

1. Si la capacidad es menor a 1.000 personas (`INTEGRACION_CAPACIDAD_MASIVA`) o el estado es
   `CANCELADA`, no hace nada.
2. Busca los contenedores activos a 300 m o menos (`INTEGRACION_RADIO_METROS`) y guarda la
   actividad en `actividad_masiva`.
3. **Zona en el mapa:** `GET /actividades-masivas` devuelve las actividades que no terminaron o
   que terminaron hace menos de 6 h (`INTEGRACION_HORAS_ZONA_EVENTO`). El mapa de CU-07 las dibuja
   como un círculo, con un aviso con la hora de fin.
4. **Escuadrilla:** si hay contenedores cerca, crea un refuerzo `act-<actividadId>` que va
   desde `fechaHoraFinalizacion` hasta 6 h después. En esa ventana, esos contenedores entran a la ruta que
   genera CU-08 aunque no estén críticos, salvo que ya se hayan vaciado desde que arrancó el
   refuerzo. El operador genera y asigna la ruta, y el chofer la cierra con CU-10.

**Errores:** si falta el id, las coordenadas o una fecha válida, el evento se ignora, se deja un
aviso en el log y se responde `204`. No se responde `400`, porque el bus lo reintentaría para
siempre.

5. **Métrica:** al agendar la escuadrilla publica `residuos.refuerzo.programado`, para Analítica.
   Es lo único que publicamos en respuesta.

## Política de errores y reintentos

- **Publicación:** implementada con outbox transaccional. El evento se escribe en la tabla
  `evento_pendiente` dentro de la misma transacción que el cambio de negocio, y un despachador la
  vacía después contra el broker con backoff exponencial. La transacción de negocio nunca se
  revierte por una falla de publicación —el contenedor se marca crítico aunque el bus esté caído—
  y el evento no se pierde: queda pendiente hasta que salga. Tras agotar los reintentos pasa a
  `FALLIDO` y queda en la tabla para inspección.
- **Consumo:** procesamiento idempotente por `eventId`. Tras 3 intentos fallidos el mensaje va a una
  *dead letter queue* para inspección manual.
