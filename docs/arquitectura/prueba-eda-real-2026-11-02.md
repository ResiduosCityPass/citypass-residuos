# Prueba completa con EDA real — 02/11/2026

## Resultado

**Completada** después del cambio de red, entre las 14:05 y las 14:11 de Argentina.
OAuth, HTTPS y Kafka/TLS en `test.citypass.mrfranco.net.ar:9092` funcionaron sin cambiar
certificados, DNS o la configuración de seguridad.

Se ejecutó el circuito:
**publicación HTTP en EDA → Avro/Kafka → inbox de Residuos → revisión del operador →
suspensión → cierre recibido por Kafka → habilitación → vaciados del chofer →
ServicioRestablecido en EDA**.

El backend y frontend corrieron localmente. Inicio y fin se publicaron con nuestra
cuenta de servicio en los tipos de simulacro registrados, schemas 39 y 40. Se usaron
el gateway y broker compartidos reales; no el simulador HTTP local ni un gateway doble.
La posición GPS del chofer se simuló con la opción del perfil local.

Esta prueba verifica el flujo completo de Residuos por EDA. La emisión de una nueva
tormenta desde la web de Espacios Públicos queda como una prueba separada de su despliegue.
Su contrato ya fue [revisado y validado](revision-espacios-publicos-2026-11-02.md).

## Identificadores

- Alerta: `SIMULACRO-RES-29cf2fb7-ad89-4b6d-931d-74317911c069`.
- Contingencia: `d42ba0a2-9461-467f-bcf0-d26913b0ee88`.
- Ruta previa: `45248afc-83cb-44c4-8a8e-1daf9cba2bca`.
- Ruta adicional de recuperación: `6003e1cd-2f1c-42df-abbe-82f5fbb55659`.
- Camión: `QA021126`; chofer: `QA-EDA-1102`.
- Zona seleccionada por el operador: **Centro**.
- Operador: delegado de Residuos con rol **OPERADOR**, sin permisos de administrador.

## Verificaciones realizadas

| Paso | Resultado observado |
| --- | --- |
| Ruta inicial | Incluyó el contenedor crítico al 90 % y se asignó al chofer |
| Inicio por EDA | Llegó por Kafka con el mismo metadata.eventId devuelto por el gateway; el inbox guardó schema 39 y source grupo6 |
| Revisión | La recepción dejó la alerta pendiente; el operador seleccionó Centro y confirmó la suspensión |
| ACTIVA | Dos contenedores pendientes, llenados conservados en 90 % y 30 %, parada del chofer suspendida |
| Protección del backend | Intentar confirmar la parada devolvió HTTP 409, código PARADA_SUSPENDIDA_INUNDACION |
| Fin por EDA | Llegó con el mismo alertaId, schema 40, y dejó PENDIENTE_RECUPERACION |
| Fin sin habilitar | La vista del chofer siguió bloqueada; un segundo intento al backend volvió a devolver 409 |
| Habilitación del operador | Pasó a EN_RECUPERACION y reapareció la acción de vaciado en la parada |
| Primer vaciado | El crítico quedó en 0 %, la primera ruta terminó y la contingencia siguió EN_RECUPERACION con un pendiente |
| Ruta adicional | Incluyó QA-EDA-02 aunque tenía solo 30 %, por estar pendiente de recuperación |
| Segundo vaciado | Cerró la segunda ruta y la contingencia pasó automáticamente a RECUPERADA |
| Control fuera de Centro | QA-EDA-03, en Norte, conservó su 85 % de llenado |

Estado final:

| Contenedor | Zona | Llenado inicial | Llenado final |
| --- | --- | --- | --- |
| QA-EDA-01 | Centro | 90 % | 0 % |
| QA-EDA-02 | Centro | 30 % | 0 % |
| QA-EDA-03 | Norte | 85 % | 85 % |

Ambas rutas quedaron **COMPLETADA**, sin paradas pendientes de este caso. Los bloqueos
manuales de las zonas permanecieron en false. La recuperación tiene cero contenedores
pendientes y ambos vaciados tienen confirmación persistida.

## Publicaciones comprobadas en EDA

Se consultó el endpoint autenticado de eventos propios de `grupo6` y se conservaron
solo los seis mensajes de esta alerta. También se observaron en la consola “Mis eventos”.
Todos los tipos de la tabla pertenecen a `com.citypass.residuos`.

| Tipo | Hora de recepción en EDA, Argentina | metadata.eventId |
| --- | --- | --- |
| SimulacroClimaticoConfirmado | 14:05:29 | 3fa6745d-b702-455f-b0bb-f54891170dfb |
| ServicioAfectado | 14:06:30 | d00326fc-74f9-4022-bfcf-1cc62eb35c60 |
| SimulacroClimaticoFinalizado | 14:08:23 | 02745cd6-a88f-4167-889f-3a7d0ff15fd0 |
| RecuperacionPendiente | 14:08:25 | 119d6d2e-925d-40b8-a510-63a22c4a8463 |
| RecuperacionHabilitada | 14:09:55 | 1c8645fd-f55a-4283-ae8b-e1d6634b64c3 |
| ServicioRestablecido | 14:11:45 | 30e3a4ac-3769-4b1f-8dc9-4b5888ef3b79 |

Las cuatro respuestas de Residuos conservaron el alertaId en `data.alertaId` y
`data.correlationId`; sus `data.eventId` coincidieron con los IDs estables del outbox.
Los cuatro registros locales quedaron **PUBLICADO**, sin errores ni reintentos.
Los dos eventos entrantes quedaron registrados en el inbox con sus IDs reales de EDA.

La [evidencia estructurada](../evidencias/eda-real-2026-11-02.json) contiene estados,
identificadores, los dos rechazos 409 y los seis mensajes resumidos, sin credenciales.

## Entorno después de la prueba

Se dejaron abiertos el panel local en **Servicio recuperado**, la vista del chofer y
el evento `ServicioRestablecido` en EDA. Los datos finales se conservan; no se reinició
ni se rellenó artificialmente un contenedor después de completar la prueba.

El consumidor también recibió las dos publicaciones históricas de Espacios Públicos
al recuperar el acceso. Permanecen pendientes de revisión y no se modificaron.
Para repetir esta misma demostración, preparar nuevamente contenedores de prueba con
llenado y publicar un inicio con ID nuevo, siguiendo [la guía](simulacro-clima-eda.md).

No fue necesario cambiar código de aplicación en esta ejecución. La validación
automática vigente del 02/11 es de 556 unitarios backend, 379 frontend y 112 E2E;
esta ejecución agrega la comprobación manual completa sobre el bus real.
