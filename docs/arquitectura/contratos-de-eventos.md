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
