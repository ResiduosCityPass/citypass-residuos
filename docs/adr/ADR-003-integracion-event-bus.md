# ADR-003 — Estrategia de integración con el event bus

- **Estado:** Aceptado
- **Fecha:** 2026-08-20
- **Decisores:** Squad 4

## Contexto

El Squad 1 es el responsable de diseñar el bus de eventos, los contratos y las políticas de
publicación/suscripción de toda la plataforma. Al 20/08 ese diseño **todavía no existe**: no
sabemos si será Kafka, RabbitMQ o un broker administrado, ni cuál será el formato de sobre del
mensaje.

Al mismo tiempo, el Hito 1 (24/09) pide un *"módulo funcional sin integración"*, y los sprints 1 y 2
son nuestra única ventana de trabajo autónomo. No podemos quedar bloqueados esperando al Squad 1,
pero tampoco escribir código que haya que tirar cuando publiquen el contrato.

## Opciones consideradas

### A. Esperar a que el Squad 1 defina el bus
- **A favor:** cero retrabajo.
- **En contra:** bloquea los sprints 1 y 2 completos. Riesgo inaceptable con el Hito 1 a cinco semanas.

### B. Acoplarse directo a un broker concreto y migrar después
- **A favor:** avance inmediato, sin capas intermedias.
- **En contra:** la lógica de dominio queda contaminada con detalles del transporte. Si el Squad 1
  elige otro broker, hay que tocar cada caso de uso que publica.

### C. Abstracción EventPublisher con implementaciones intercambiables  (elegida)
- **A favor:** el dominio depende de una interfaz propia, nunca del broker. Se avanza desde el día
  uno y la migración al bus real es una clase nueva, sin tocar reglas de negocio. Habilita además
  tests unitarios con un doble en memoria.
- **En contra:** una capa de indirección más para mantener.

## Decisión

Se define en la capa de dominio la interfaz:

```typescript
interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
```

Con tres implementaciones seleccionables por variable de entorno `EVENT_BUS_DRIVER`:

| Driver | Uso | Estado |
|---|---|---|
| `inmemory` | Tests y desarrollo sin infraestructura | Implementado |
| `rabbitmq` | Broker local en Docker | Pendiente |
| `platform` | Bus real definido por el Squad 1 | Pendiente, Sprint 3 |

### Outbox transaccional *(agregado en el Sprint 2)*

El dominio no publica contra el broker: escribe el evento en una tabla `evento_pendiente`
**dentro de la misma transacción** que el cambio de negocio que lo origina. Un despachador aparte
la vacía después contra el transporte real.

Por eso hay dos tokens y no uno:

| Token | Quién lo usa | Qué es |
|---|---|---|
| `EVENT_PUBLISHER` | El dominio | Escribe en la tabla outbox |
| `TRANSPORTE_EVENTOS` | Solo el despachador | El broker de verdad |

El dominio no sabe —ni tiene por qué saber— si el evento sale ya mismo o dentro de cinco segundos
tras dos reintentos.

El despachador reintenta con backoff exponencial y, agotados los intentos, marca el evento como
`FALLIDO` sin borrarlo: es la *dead letter* que menciona el contrato de eventos.

Los eventos se emiten **siempre**, desde el Sprint 1. Lo único que cambia entre hitos es dónde
aterrizan. Así la dimensión 5 de la rúbrica queda demostrable incluso en el Hito 1, donde la
integración real todavía no se exige.

## Consecuencias

- La nomenclatura de tópicos sigue la convención del enunciado (`reclamos.creado`,
  `movilidad.bici.devuelta`): usamos `residuos.<entidad>.<accion>`. Ver
  [contratos de eventos](../arquitectura/contratos-de-eventos.md).
- Todo evento lleva `eventId` (UUID) y `occurredAt`, para que los consumidores puedan deduplicar.
  Asumimos entrega *at-least-once* y no confiamos en el orden de llegada.
- Al comenzar el Sprint 3 hay que negociar el formato de sobre con el Squad 1. Si difiere del
  nuestro, la traducción vive en la implementación `platform`, no en el dominio.
- La ingesta de lecturas corre dentro de una transacción explícita. Los repositorios resuelven su
  `EntityManager` desde un contexto basado en `AsyncLocalStorage`, así que participan de la
  transacción en curso sin que el manager viaje como parámetro por la capa de aplicación y sin
  ensuciar los puertos del dominio con un tipo de TypeORM.
- **Acción abierta:** contactar al Squad 1 antes del cierre del Sprint 0 para acordar el borrador de
  contrato. Responsable: Nicolás (PM).
