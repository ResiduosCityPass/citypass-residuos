# Prueba de integración climática desplegada — 3 de noviembre de 2026

El circuito de alertas se verificó desde la web desplegada de Espacios Públicos,
pasando por EDA y Kafka, hasta Residuos desplegado en Render y sus respuestas al
bus. **Queda pendiente probar rutas con paradas suspendidas y vaciados de chofer
en este entorno.** Esta ejecución no tuvo trabajo de recolección pendiente.

## Escenario y alcance

- Productor: https://espacios-publicos-frontend.vercel.app/admin/weather-alerts
- Receptor: https://citypass-residuos-frontend.onrender.com/contingencias
- Bus: https://test.citypass.mrfranco.net.ar/
- Identificación interna: `SIMULACRO-QA-PROD-20261103`, sin fenómeno real.
- Fenómeno `LLUVIA_INTENSA`, criticidad `ALTA`, barrio `SAN NICOLAS`.
- Alerta: `bba18974-ee18-444f-80b7-8ddc0408f9d6`.
- Contingencia: `b3d89c85-1589-40bc-a767-4cc8fde9fba9`.
- Zona lógica de ensayo: `zona test 2`, ID
  `db99391e-f272-4e55-b135-2c664cde5dd3`.
- El operador registró explícitamente una asignación sintética para el ejercicio;
  no se dedujo un área de afectación a partir de las coordenadas del evento.
- La zona tenía un contenedor vacío, sin rutas activas. Se preservaron los demás
  recursos. No se usó el simulador HTTP ni se publicaron manualmente los eventos
  de entrada en EDA.

## Resultados observados

1. La confirmación desde Espacios llegó a Residuos a las **22:37:11 UTC** como
   alerta de origen `eda`, pendiente de revisión. No suspendió zonas por sí sola.
2. El operador confirmó la suspensión solo de `zona test 2`, a las **22:39:06
   UTC**. La contingencia quedó `ACTIVA`; las otras cinco zonas no recibieron
   restricciones.
3. Se finalizó la misma alerta desde Espacios a las **22:39:37 UTC**. Residuos
   recibió el cierre y pasó a `PENDIENTE_RECUPERACION`. La zona siguió restringida.
4. El operador habilitó la recuperación a las **22:40:06 UTC**. Se registró
   `EN_RECUPERACION` y, al no haber contenedores pendientes, `RECUPERADA` en la misma
   operación. No hubo vaciados en esta prueba.
5. El catálogo de eventos de la cuenta de Residuos en EDA confirmó las cuatro
   respuestas, todas con el mismo `alertaId` y `correlationId` de la alerta.

| Respuesta | Estado | ID asignado por EDA |
| --- | --- | --- |
| ServicioAfectado | ACTIVA | e9d1e0af-d467-4922-a476-18ee9e6d4508 |
| RecuperacionPendiente | PENDIENTE_RECUPERACION | 72ff63fb-36e9-415a-94a4-3e0025401f22 |
| RecuperacionHabilitada | EN_RECUPERACION | 2a0fae19-2c43-46dd-9fba-6fe3e6aafb35 |
| ServicioRestablecido | RECUPERADA | e334dbea-1631-488b-a6d1-5c236a549502 |

Las consultas de metadatos de los dos tópicos de entrada mostraron un avance de
`3 → 4` para confirmaciones y `1 → 2` para finalizaciones. La recepción del
`alertaId` en la API y la web de Residuos permitió correlacionar ambos mensajes.
No se reprodujo el historial de otros módulos ni se alteró el grupo consumidor
de producción.

Se compararon las respuestas de API antes, durante y después: contenedores
(incluyendo llenado y sensores), rutas, camiones y choferes quedaron iguales. Al
terminar, ninguna zona conservaba restricciones de inundación. La alerta de
Espacios quedó finalizada y la contingencia de Residuos recuperada.

## Pendiente para la prueba operativa completa

**Resuelto en un segundo ensayo:** ver [prueba operativa completa en Render](prueba-operativa-render-2026-11-03.md).
Lo que sigue describe el pendiente al cerrar la primera ejecución, sin vaciados.

Preparar un escenario aislado con contenedores al 90 % y 30 %, un control en otra
zona, un camión, un chofer y una ruta asignada. Verificar suspensión de paradas,
exclusión del ruteo, recuperación prioritaria y cierre mediante vaciados.

`delegado-res` tiene rol `OPERADOR`; crear esos recursos y emitir la credencial
interna de un chofer requiere `ADMINISTRADOR`. Render Free no ofrece Shell ni
one-off jobs para ejecutar el preparador dentro del servicio. Se solicitó una
cuenta administradora ya asignada o datos de ensayo habilitados; no se ampliaron
permisos ni se cambió el plan de Render.

Mientras se espera esa cuenta, quedó preparado y validado localmente el
[ensayo operativo por HTTP](prueba-operativa-http.md): crea los datos desde las
APIs y verifica cada etapa sin depender de acceso externo a PostgreSQL ni Shell.
No se ejecutó su preparación sobre Render. La auditoría automática de las cuatro
respuestas EDA de este caso ya pasó usando `eda:auditar`.

Las auditorías JSON y capturas locales de esta ejecución están en
`/tmp/citypass-integracion-qa/`, con prefijo `desplegado-` y subdirectorio
`evidencias-desplegado-20261103/`. No contienen tokens ni secretos.
