# Coordinación de la integración

Actualizado el 02/11/2026. No se enviaron mensajes a otros equipos.

## Datos resueltos

Se verificó `citypass-residuos-web` con el IdP real, incluyendo login, firma, refresh y
logout. `grupo6` se autenticó como servicio con namespace `com.citypass.residuos`, aunque
la tabla histórica del README difiera. Se consultaron los dos schemas climáticos reales
y se comprobó el acceso por Kafka/TLS. No hace falta volver a pedir esos identificadores.

Ramiro eligió que `delegados` tenga rol OPERADOR de Residuos, sin permisos de administrador.
No se cambiaron grupos ni membresías en el directorio remoto.

Se recibió y revisó `featuresDidi` de Espacios Públicos. Su contrato es compatible y
la ola de calor de su captura ya se había recibido el 01/11. Los tipos propios de
simulacro se registraron en EDA (39 y 40). El cambio de red resolvió el acceso a Kafka
y se completó el flujo hasta RECUPERADA con los seis mensajes verificados en EDA.
Ver [prueba real completada](prueba-eda-real-2026-11-02.md). Ya no hace falta consultar
por el bloqueo de acceso anterior al puerto 9092.
Ver [revisión, validación y mensaje actualizado para EDA](revision-espacios-publicos-2026-11-02.md).

## Mensaje actualizado para Espacios Públicos

Probamos nuevamente el 02/11 desde tu web: creamos y confirmamos a las 15:56:37 AR
el simulacro `9cb579b4-297f-4b3d-bbd6-6e8e04d501d9` (lluvia intensa, ALTA, San Nicolás)
y lo finalizamos a las 16:03:36. La web informó éxito en ambos pasos, pero los tópicos
de Confirmada y Finalizada siguen con high offset 1, sin registros nuevos. Nuestro
consumidor está conectado y el flujo completo con nuestros propios eventos en EDA
ya funcionó. ¿Podés revisar el Outbox de esa alerta y confirmar que el backend
desplegado usa `EVENT_BUS_DRIVER=citypass`, apunta al gateway de test y qué HTTP
devolvió cada publicación? En el repo, el driver `console` también informa éxito.
No hacen falta secretos. Cuando esté corregido repetimos con una alerta nueva y
la mantenemos activa mientras verificamos la suspensión.

Ver [resultado, identificadores y evidencia del nuevo intento](prueba-espacios-web-2026-11-02.md).

## Mensaje para Espacios Públicos y EDA: prueba compartida

### Incidencia de la prueba del 01/11 (registro histórico)

Hola, probamos desde la web de Espacios Públicos el simulacro
`b0e77c1d-7807-4add-bd48-f140c12728f5` (`LLUVIA_INTENSA`, `ALTA`, San Nicolás).
Lo confirmamos el 01/11 cerca de las 21:13 y lo finalizamos a las 21:16:40, hora argentina.
La web informó éxito en ambas acciones, pero los tópicos
`com.citypass.espacios.CriticidadClimaticaConfirmada` y
`com.citypass.espacios.CriticidadClimaticaFinalizada` siguen con un solo registro
histórico cada uno (partición 0, high offset 1), sin los mensajes nuevos. Nuestro
consumidor está conectado y Residuos sí publicó `RutaGenerada` y `RutaAsignada` en EDA.

¿Podés revisar el Outbox y el adaptador de publicación del backend desplegado de
Espacios Públicos? Necesitamos confirmar el gateway de destino, tipos de evento,
namespace de la cuenta de servicio y resultado HTTP de cada envío. El repositorio
ya se recibió y revisó el 02/11; no hace falta volver a solicitarlo ni compartir secretos.
Después repetimos con una alerta nueva para observar primero la suspensión activa y
luego la recuperación.

Detalle de la prueba: [prueba-clima-real-2026-11-01.md](prueba-clima-real-2026-11-01.md).

### Flujo que queremos verificar cuando llegue la alerta

Hola, Residuos ya tiene implementados el login federado y la recepción por Kafka de
`com.citypass.espacios.CriticidadClimaticaConfirmada` y
`com.citypass.espacios.CriticidadClimaticaFinalizada`.

¿Coordinamos una prueba? Necesitamos una confirmación con un `alertaId` nuevo y después
su finalización con el mismo identificador. En Residuos el operador revisa la afectación,
selecciona las zonas y suspende la recolección; al finalizar habilita la recuperación.

Publicamos las respuestas en `com.citypass.residuos.ServicioAfectado`,
`com.citypass.residuos.RecuperacionPendiente`,
`com.citypass.residuos.RecuperacionHabilitada` y
`com.citypass.residuos.ServicioRestablecido`. `data.alertaId` y `data.correlationId`
permiten vincularlas con la alerta de Espacios Públicos. Para deduplicar nuestras
publicaciones usen el `data.eventId` estable de Residuos.

También necesitamos terminar de acordar el alcance geográfico: recibimos puntos y barrios,
pero nuestras zonas todavía no tienen polígonos ni códigos compartidos. Mientras tanto,
el operador selecciona explícitamente las zonas afectadas.

## Mensaje opcional para Login

Hola, confirmamos que el login de Residuos funciona con `citypass-residuos-web` y el
issuer de la guía. Observamos que el IdP real devuelve `aud` como string y `grupo6`
pertenece a `com.citypass.residuos`. EDA exige token `service`, así que el backend usa
client_credentials en lugar del token humano. Sería útil actualizar esos puntos en las
guías/tablas para que los demás equipos no integren con los valores anteriores.
