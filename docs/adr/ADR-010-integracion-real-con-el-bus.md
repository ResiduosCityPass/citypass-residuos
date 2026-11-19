# ADR-010 — Integración real con el bus de CityPass+

- **Estado:** Aceptado
- **Fecha:** 2026-11-18. Registra decisiones tomadas entre el 22/10 y el 13/11.
- **Decisores:** Squad 4
- **Supersede parcialmente:** [ADR-003](ADR-003-integracion-event-bus.md), en lo que deja pendiente
  el driver `platform` y prevé un driver `rabbitmq`

## Contexto

El [ADR-003](ADR-003-integracion-event-bus.md) separó el dominio del transporte con la interfaz
`EventPublisher` y una tabla outbox, y dejó para el Sprint 3 el driver `platform`, porque el Squad 1
todavía no había definido el bus. Ese diseño ya existe, y es distinto de lo que se suponía en agosto:

- **Para publicar**, el Squad 1 expone un gateway HTTP. Cada tipo de evento tiene que estar en su
  catálogo (`event-types.json`), con su esquema Avro. El gateway arma el sobre CloudEvents. Si el
  tipo no está registrado, responde 404.
- **Para consumir**, hay dos vías sobre el mismo sobre (`metadata` + `data`):
  - **Kafka directo**, la que recomienda EDA: autenticación SASL OAUTHBEARER con la credencial de
    servicio que entrega Login (Grupo 2), `group.id` con el prefijo del namespace y mensajes Avro
    en formato Confluent. El registry es el `/api/v1` del gateway.
  - **Un webhook** que el dispatcher del gateway llama con el secreto de la suscripción en
    `?token=`. Reintenta 3 veces cada 2 s y después manda el evento a la DLQ.
- **El token de servicio** dura 15 minutos y lo emite Login con `client_credentials`.
- **El gateway a veces tarda** unos 30 s en responder un POST, y publica igual. Emergencias lo
  midió el 13/11.

Además, la API corre en el plan gratuito de Render ([ADR-008](ADR-008-destino-cloud.md)). Ese
plan duerme el servicio por inactividad y el arranque en frío tarda alrededor de un minuto.

Los nombres del catálogo (`AlertaGenerada`, `ReclamoEvaluado`, `IntervencionActualizada`, …) no
coinciden con los nombres internos del dominio (`residuos.contenedor.critico`, …), y varios
eventos del dominio no le interesan a nadie fuera del módulo.

## Opciones consideradas

### Publicación

#### A. Producir directo a Kafka
- **A favor:** una sola tecnología para publicar y consumir.
- **En contra:** obliga a serializar en Avro y armar el sobre CloudEvents nosotros. Saltea la
  validación del catálogo, que es la que el Squad 1 usa para gobernar los contratos. Un evento
  mal formado llegaría igual a los consumidores.

#### B. POST al gateway HTTP desde el despachador del outbox  (elegida)
- **A favor:** el gateway valida contra el catálogo y arma el sobre. Para el outbox es un
  transporte más, detrás de `TRANSPORTE_EVENTOS`. Los reintentos con backoff y el estado
  `FALLIDO` del ADR-003 siguen valiendo sin cambios.
- **En contra:** depende de la disponibilidad del gateway. Lo mitiga el outbox, que conserva el
  evento hasta que sale.

### Consumo

#### A. Solo webhook
- **A favor:** el más simple. Además, despierta a la API dormida en Render.
- **En contra:** el primer evento después de dormir se pierde: los 3 reintentos de 2 s terminan
  antes de que la API arranque. No es la vía que recomienda EDA.

#### B. Solo Kafka
- **A favor:** la vía recomendada. No pierde eventos por timeout, porque el consumidor lee a su
  ritmo.
- **En contra:** con la API dormida nadie lee, y nada la despierta.

#### C. Kafka y webhook, los dos hacia el mismo `IntegracionService.procesar`  (elegida)
- **A favor:** Kafka es la vía principal y el webhook despierta la API. Como los dos llaman al
  mismo método, la lógica de negocio no se duplica.
- **En contra:** un mismo evento puede llegar dos veces. Por eso el procesamiento es idempotente
  por `eventId`.

### Traducción de nombres

#### A. Renombrar los eventos del dominio con los nombres del catálogo
- **En contra:** ata el dominio al contrato de otro squad, justo lo que el ADR-003 quería evitar.

#### B. Un traductor en el borde del transporte  (elegida)
- `traducirAGateway` (`shared/events/gateway/traductor-gateway.ts`) convierte cada evento del
  dominio en el tipo y los campos del catálogo. Si devuelve `null`, el evento no sale del módulo:
  es el caso de las rutas generadas, asignadas o recalculadas y de las paradas omitidas.

## Decisión

- `EVENT_BUS_DRIVER` admite dos valores: `inmemory` para tests y desarrollo, y `platform` para el
  bus real con `GatewayTransporte`. **El driver `rabbitmq` del ADR-003 no se implementa**:
  el bus real llegó antes de que hiciera falta un broker local.
- **Publicación:** el despachador del outbox hace POST al gateway con un token de servicio de
  Login, que se renueva 30 s antes de vencer. Espera la respuesta hasta 45 s
  (`TIMEOUT_GATEWAY_MS`). Con menos, el despachador lo daba por fallido, lo reintentaba y el
  evento salía duplicado con otro `eventId`.
- **Consumo:** `CitypassKafkaConsumer` se suscribe a los tópicos de Reclamos, Emergencias y
  Espacios con una expresión regular. Arranca desde lo último, no desde el historial, y un mensaje
  mal formado se loguea y se saltea para no trabar la partición. `CitypassWebhookController`
  recibe el mismo sobre y exige `GATEWAY_WEBHOOK_TOKEN`, comparado en tiempo constante.
- **Tipos nuevos:** antes de publicar un tipo nuevo, hay que registrarlo en el catálogo del gateway.
  Si no está, el gateway responde 404 y, agotados los reintentos, el evento queda `FALLIDO` en
  el outbox, visible para inspección.
- La configuración de producción está en [`render.yaml`](../../render.yaml): `GATEWAY_*` y
  `KAFKA_*`, con los secretos como `sync: false`.

## Consecuencias

- El dominio no cambió: los casos de uso escriben en el outbox igual que en el Sprint 1. La
  integración real fue una clase de transporte, un traductor y dos puntos de entrada, como
  anticipaba el ADR-003.
- Entrega *at-least-once* en las dos direcciones. Al publicar, `data.eventId` es estable entre
  reintentos del outbox, aunque el gateway genere un `metadata.eventId` nuevo en cada POST. Al
  consumir, se deduplica por `eventId`.
- Kafka resuelve la expresión regular contra los tópicos que existen al conectarse. Un tipo
  registrado después entra en el próximo arranque, y en Render free eso pasa seguido.
- Los contratos de cada evento, publicados y consumidos, están en
  [contratos-de-eventos.md](../arquitectura/contratos-de-eventos.md). Cómo leer las variantes de
  contrato está en el [ADR-012](ADR-012-tolerancia-a-contratos-entre-squads.md).
- Evidencia: [prueba con EDA real del 02/11](../arquitectura/prueba-eda-real-2026-11-02.md).
