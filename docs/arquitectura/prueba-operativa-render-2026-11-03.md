# Ensayo operativo completo en Render — 3 de noviembre de 2026

**Resultado: RECUPERADA.** Se disparó una alerta nueva desde la web desplegada de
Espacios Públicos; Residuos la recibió por EDA/Kafka en Render, suspendió una ruta,
esperó la finalización real y la habilitación del operador, y cerró la recuperación
después de confirmar dos vaciados. Las cuatro respuestas se verificaron en EDA.
El ensayo ocurrió el 03/11 por la noche en Argentina (04/11 entre 01:48 y 01:54 UTC).

## Identidades y preparación

El delegado de Residuos administró su directorio mediante la API utilizada por el
cliente oficial de Login: `/panel/people` y `/panel/group-memberships/bulk`. Se
creó `qa-admin-res` con el único grupo `residuos-administradores`. Se verificó el
perfil en `/me`, la sesión ADMINISTRADOR en la API de Residuos y el inicio de sesión
en la web desplegada. `delegado-res` conserva el grupo `delegados` y el rol OPERADOR.
Las credenciales están en archivos locales ignorados por Git, con permisos `0600`.

La cuenta administradora preparó el escenario `WEB01` por las APIs normales,
usando `demo:http preparar --apply`. Se crearon dos zonas, tres contenedores con
sensores nuevos, el camión de ensayo `QA123ZZ`, un chofer y una ruta asignada al
contenedor crítico. La preparación y las lecturas publicaron sus eventos normales;
los eventos climáticos fueron publicados por Espacios Públicos desde su web.

| Recurso | Identificador |
| --- | --- |
| Alerta Espacios | `0a9cf43f-dd69-4977-8bf9-5deccd171f07` |
| Contingencia Residuos | `a985c3dc-c5fc-46fe-b40d-4544fece6429` |
| DEMO-WEB01 Centro | `a6c79569-e4bf-4498-9f36-cd9702b57fa9` |
| DEMO-WEB01 Norte (control) | `b45fa3e2-a299-41d5-823d-f1b35e9c052c` |
| Ruta inicial, contenedor 01 al 90 % | `d846defb-7070-4e8a-bf08-dc42c2e6835d` |
| Segunda ruta, contenedor 02 al 30 % | `f760e1ce-9ab0-4c94-910f-a7bb7af2cfdf` |

La alerta se identificó como `SIMULACRO-QA-OPERATIVO-WEB01`, LLUVIA_INTENSA, ALTA,
con SAN NICOLAS como punto representativo. El operador dejó explícita la asignación
sintética a DEMO-WEB01 Centro. No se infirió un polígono ni se eligieron zonas ajenas.

## Resultados por etapa

| Momento UTC (04/11) | Comprobación |
| --- | --- |
| 01:48:17 | Llegó la alerta, origen `eda`, pendiente de revisión. Recibirla no suspendió la ruta. |
| 01:49:07 | El operador confirmó suspensión de Centro: ACTIVA, una parada suspendida y dos contenedores pendientes, incluyendo al del 30 %. |
| 01:49:17 | Vaciado rechazado con 409 `PARADA_SUSPENDIDA_INUNDACION`; habilitación anticipada rechazada con 409 `INUNDACION_ACTIVA`. |
| 01:50:20 | Se finalizó la misma alerta desde Espacios. Pasó a PENDIENTE_RECUPERACION. |
| 01:50:30 | El vaciado siguió rechazándose con 409 `PARADA_SUSPENDIDA_INUNDACION`. Los llenados seguían en 90/30/85 %. |
| 01:51:31 | El operador habilitó recuperación: EN_RECUPERACION. La habilitación no vació los contenedores. |
| 01:52:22 | Se confirmó el vaciado del 01: primera ruta COMPLETADA; niveles 0/30/85 % y contingencia aún EN_RECUPERACION. |
| 01:53:08 | La nueva propuesta filtrada a Centro incluyó solo al contenedor del 30 %, aunque no era crítico. Se asignó al mismo chofer. |
| 01:53:46 | Se confirmó el segundo vaciado: segunda ruta COMPLETADA, niveles 0/0/85 % y contingencia RECUPERADA. |

Las seis etapas se comprobaron con el verificador HTTP. El cierre exige las dos
paradas CONFIRMADAS y `vaciadoEn` para ambos impactos. No se omitieron paradas.
El control de Norte conservó su llenado 85 % y estado CRITICO; no recibió restricciones.
Al terminar no quedaron restricciones de inundación en las zonas consultadas.

La creación/finalización de la alerta, revisión de afectación y habilitación se
realizaron en las webs desplegadas. Los vaciados se confirmaron contra la API real
con la credencial interna del chofer de ensayo y las coordenadas sintéticas de sus
contenedores. Esto acredita el flujo de negocio y el endpoint de confirmación;
no acredita la geolocalización del navegador ni un vaciado físico. La simulación
GPS del frontend y los simuladores HTTP de clima permanecieron deshabilitados.

## Respuestas verificadas en EDA

El comando `eda:auditar` verificó emisor, correlación, contingencia, zona y estado.

| Evento | Estado | ID EDA |
| --- | --- | --- |
| ServicioAfectado | ACTIVA | `5fd5e1ca-3779-4a03-959a-e4b4c8be24f2` |
| RecuperacionPendiente | PENDIENTE_RECUPERACION | `ee1a0a51-c252-40fa-bc1a-9d6a4ebe374e` |
| RecuperacionHabilitada | EN_RECUPERACION | `e55443bb-4709-4717-a6db-cdb0e2a7236c` |
| ServicioRestablecido | RECUPERADA | `6286659f-f537-4864-81df-7a0fe7cf12df` |

Todos conservan el `alertaId` y su correlación. Los registros de auditoría y las
capturas están localmente en `/tmp/citypass-integracion-qa/`, con prefijo
`render-web01-` y subdirectorio `evidencias-web01/`. Las credenciales no forman
parte de esos informes ni del repositorio.

El ensayo pasó sobre el backend desplegado de main `2d698ae`. La corrección de
prioridad para cuentas con varios grupos está en el PR de develop; esta cuenta
administradora tiene un solo grupo reconocido y funciona con el despliegue actual.
