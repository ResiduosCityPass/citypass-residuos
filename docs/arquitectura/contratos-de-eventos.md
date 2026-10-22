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
  "bloqueadoHasta": "2026-10-22T22:00:00.000Z",
  "correlationId": null,
  "occurredAt": "2026-10-22T18:00:00.000Z"
}
```

| Campo | Qué es |
|---|---|
| `reclamoId` | Id del reclamo en el módulo de Reclamos. **Es la clave para contar** |
| `afectaRecoleccion` | `true` si el auto tapa al menos un contenedor (a `OBSTRUCCION_RADIO_METROS`, 15 m). `false` si no tapa ninguno |
| `contenedoresAfectados` | Los contenedores tapados, con la distancia al auto. Vacío si `afectaRecoleccion` es `false` |
| `rutasRecalculadas` | Rutas vivas que perdieron una parada por este reclamo. Vacío si ninguna ruta tenía esos contenedores |
| `bloqueadoHasta` | Hasta cuándo queda bloqueado si nadie avisa que se resolvió. `null` si no afecta |
| `occurredAt` | Momento de la decisión. Es la fecha para agrupar por período |

**Consumidores esperados:**
- **Reclamos (Squad 5):** para saber si el reclamo afectó la recolección.
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

> **Pendiente del Squad 1:** registrar `ReclamoEvaluado` en el catálogo del gateway. Mientras no
> esté, el gateway responde 404 y el evento queda `FALLIDO` en el outbox.

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
| `movilidad.calle.cortada` | 3 — Movilidad Urbana | Se excluye el tramo del cálculo de ruta. Si la ruta ya estaba asignada, se marca para recálculo. |
| `reclamos.creado` | 5 — Reclamos Ciudadanos | Si la categoría es residuos y referencia un contenedor nuestro, se le adjunta el reclamo y se eleva su prioridad en el ruteo. |
| `com.citypass.reclamos.ReclamoCreado` (o variantes) | 5 — Reclamos Ciudadanos | **CU-INT-02, implementado.** Si es de estacionamiento indebido y el auto tapa un contenedor, lo sacamos del ruteo, recalculamos las rutas vivas y publicamos `ReclamoEvaluado`. Las variantes aceptadas están en `contrato-reclamos.ts` |
| Aviso de reclamo resuelto (`ReclamoResuelto`, `IntervencionFinalizada`, …) | El squad que resuelva el reclamo, a definir | **CU-INT-02, implementado.** Destapamos los contenedores del reclamo. Si nadie avisa, el bloqueo vence solo |

> Estos tres nombres son **supuestos**, derivados de la descripción de cada módulo en el enunciado.
> Hay que confirmarlos con cada squad durante el Sprint 3, que es la instancia donde la cátedra
> planifica el diseño colaborativo de casos de uso transversales.

## Política de errores y reintentos

- **Publicación:** implementada con outbox transaccional. El evento se escribe en la tabla
  `evento_pendiente` dentro de la misma transacción que el cambio de negocio, y un despachador la
  vacía después contra el broker con backoff exponencial. La transacción de negocio nunca se
  revierte por una falla de publicación —el contenedor se marca crítico aunque el bus esté caído—
  y el evento no se pierde: queda pendiente hasta que salga. Tras agotar los reintentos pasa a
  `FALLIDO` y queda en la tabla para inspección.
- **Consumo:** procesamiento idempotente por `eventId`. Tras 3 intentos fallidos el mensaje va a una
  *dead letter queue* para inspección manual.
