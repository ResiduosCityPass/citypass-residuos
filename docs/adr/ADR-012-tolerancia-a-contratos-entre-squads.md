# ADR-012 — Tolerancia a contratos de eventos entre squads

- **Estado:** Aceptado
- **Fecha:** 2026-11-18. Registra el criterio aplicado desde el 21/10.
- **Decisores:** Squad 4

## Contexto

Los casos de uso integradores dependen de eventos de otros squads: Reclamos, Emergencias y
Espacios Públicos. Esos contratos se cerraron tarde y siguieron cambiando durante los sprints 4 a 6:

- **Nombres de tipo distintos para lo mismo.** `EmergenciaActualizada` y
  `EmergenciaEstadoActualizado`, por ejemplo, o `ReclamoResuelto` y `ReclamoActualizado` con
  `estadoNuevo: RESUELTO`.
- **Campos en otro idioma o con otro nombre.** Espacios publica `ActividadCreada` en inglés
  (`capacity`, `latitude`, `endDate`), cuando el borrador estaba en castellano.
- **Datos opcionales que llegan `null` seguido.** Es el caso de `objetoAfectado` en los reclamos,
  que elige el vecino.
- **Remitente indefinido.** No se sabía qué squad avisa que un reclamo se resolvió.

Hay un detalle técnico que condiciona la decisión: si el webhook responde con error, el dispatcher
del Squad 1 reintenta el evento y después lo manda a la DLQ. Rechazar un evento que nunca va a ser
válido no corrige nada: solo genera reintentos y ruido en la DLQ de otro squad.

## Opciones consideradas

### A. Validación estricta: rechazar con 400 todo lo que no siga nuestro formato
- **A favor:** contratos explícitos y errores visibles enseguida.
- **En contra:** nuestro formato sería inventado, porque el contrato real no existía. Cada
  diferencia de nombre rompería la integración hasta un nuevo deploy, y los rechazos llenarían la
  DLQ del Squad 1.

### B. Esperar a que cada contrato esté cerrado para implementar
- **A favor:** cero retrabajo.
- **En contra:** algunos contratos se cerraron en la última semana. Los casos integradores no
  hubieran llegado a la entrega.

### C. Aceptar las variantes razonables e ignorar lo inutilizable  (elegida)
- **A favor:** la integración funciona con lo que los otros squads publican de verdad. Las
  variantes viven en un solo lugar por contrato y se recortan cuando el contrato se cierra.
- **En contra:** listas de nombres que hay que mantener, y el riesgo de aceptar algo de más.
  Lo mitigan los tests de cada variante y los logs.

## Decisión

- **Variantes en un solo lugar.** Los nombres de tipo y de campo aceptados están en constantes,
  una por contrato. Por ejemplo, `integracion/domain/reglas/contrato-reclamos.ts` para Reclamos.
  Cada lista lleva un comentario que indica cuándo recortarla.
- **Lo inutilizable se ignora y se loguea, no se rechaza.** Un evento con un tipo que no
  manejamos, o con datos que no alcanzan para decidir (sin ubicación, por ejemplo), se registra en
  el log y se responde 204. **Un sobre estructuralmente inválido, sin `metadata.eventId`,
  `metadata.eventType` o `data`, sí se rechaza con 400**: no se puede deduplicar ni procesar.
- **No se asume quién publica algo que no está definido.** El aviso de que un reclamo se resolvió se
  acepta de cualquier squad, y si nadie avisa, el bloqueo vence solo a las 4 h.
- **Un dato opcional nunca descarta.** `objetoAfectado` puede sumar evidencia (`CICLOVIA` alcanza
  con categoría `TRANSITO`), pero su ausencia no descarta un reclamo. En ese caso decide el texto.
- **Los eventos que generamos nosotros se ignoran.** Reclamos abre reclamos de categoría `RESIDUOS`
  a partir de nuestras alertas, y no los volvemos a procesar.

## Consecuencias

- Una variante prevista no requiere cambios de código; una nueva se agrega en su lista, sin tocar
  las reglas de negocio.
- Al cerrar cada contrato hay que recortar sus listas a los nombres reales. La tabla de
  [contratos-de-eventos.md](../arquitectura/contratos-de-eventos.md) indica cuáles están en el
  catálogo y cuáles siguen aceptándose por compatibilidad.
- Los tests de `integracion` cubren cada variante aceptada y cada caso que se ignora, así que
  recortar una lista hace fallar el test correspondiente.
- La deduplicación por `eventId` ([ADR-010](ADR-010-integracion-real-con-el-bus.md)) sigue valiendo
  para todas las variantes.
