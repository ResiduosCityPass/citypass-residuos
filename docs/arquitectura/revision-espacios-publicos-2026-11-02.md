# Revisión del repositorio de Espacios Públicos — 02/11/2026

**Actualización posterior al cambio de red:** el acceso a Kafka se recuperó y se
completó el flujo de Residuos por EDA real. Ver [prueba y evidencia](prueba-eda-real-2026-11-02.md).
El diagnóstico de conexión y mensaje para EDA al final de este documento son históricos.

**Nuevo intento desde su web:** se confirmó y finalizó otra alerta el 02/11, sin
publicaciones nuevas observadas en EDA. Ver [evidencia y pedido de revisión del backend desplegado](prueba-espacios-web-2026-11-02.md).

## Versiones revisadas

- `featuresDidi`: `6d2234b5f6d3bd21939352b9e4108fddf0ad200c`.
- `main`: `30b17111d37643e37ded1bbffb69b8cce28fd257`.
- [Repositorio y rama recibidos](https://github.com/DappianoLuciano/DESAPPS2EspaciosPublicos/tree/featuresDidi).

La revisión se hizo en una copia temporal, sin ejecutar sus scripts ni modificar su
repositorio, despliegue o base de datos. Un snapshot literal de sus schemas y del
payload de la captura está en `backend/test/fixtures/espacios-publicos-clima.json`.

## Resultado de compatibilidad

Residuos acepta los dos contratos de esa rama:

| Tipo | Datos relevantes |
| --- | --- |
| `com.citypass.espacios.CriticidadClimaticaConfirmada` | `alertaId`, nivel, fenómeno, coordenadas, barrios, vigencias en milisegundos, temperaturas nullable y actor |
| `com.citypass.espacios.CriticidadClimaticaFinalizada` | Mismo `alertaId`, `finalizadaEn` en milisegundos y actor |

El publicador envía solo el payload al gateway. EDA añade metadata y Avro; Residuos
decodifica usando el schemaId del mensaje, sin fijarlo al schema vigente del catálogo.
Esto permite leer mensajes antiguos bajo schema 26 y nuevos bajo schema 28.
Fuentes: [schema del productor](https://github.com/DappianoLuciano/DESAPPS2EspaciosPublicos/blob/6d2234b5f6d3bd21939352b9e4108fddf0ad200c/espacios-publicos-backend/scripts/register-weather-event-types.ts),
[publicador HTTP](https://github.com/DappianoLuciano/DESAPPS2EspaciosPublicos/blob/6d2234b5f6d3bd21939352b9e4108fddf0ad200c/espacios-publicos-backend/src/infrastructure/events/CityPassEventGatewayBus.ts).

Los barrios identifican dónde caen los puntos consultados; no delimitan el área de
afectación de una tormenta. Se mantiene la selección explícita de zonas de Residuos.

El `alertaId` de la captura, `f6029e4f-e0ef-46b8-9f1a-66e814f1c90e`, corresponde a
**OLA_DE_CALOR**. Ese mensaje ya había sido recibido en la prueba del 01/11, con
`metadata.eventId=48e985a8-5687-49c6-bdf0-3050e8454695`. No requiere un merge a main
para consumirlo si continúa retenido en Kafka. La finalización histórica recibida
entonces tenía otro `alertaId`, `cfc9ec48-b904-46c9-8272-6edceb1aecfe`: no cierra esa
misma ola de calor. Para demostrar inundación se necesita una alerta de prueba
apropiada y una decisión operativa fundamentada; recibir calor no suspende automáticamente.

## Publicación y cierre en Espacios Públicos

El adaptador HTTP ya existe en main; la rama incorpora, entre otros cambios,
barrios y controles adicionales de orden/canal. El merge por sí solo no habilita EDA:
[`createEventBus`](https://github.com/DappianoLuciano/DESAPPS2EspaciosPublicos/blob/6d2234b5f6d3bd21939352b9e4108fddf0ad200c/espacios-publicos-backend/src/infrastructure/events/createEventBus.ts#L7)
usa `console` por defecto. El envío real necesita `EVENT_BUS_DRIVER=citypass` y las
variables `EVENT_*` de su backend. En modo consola, el publicador también devuelve
éxito y el Outbox marca PUBLISHED. Es una explicación posible de la prueba del 01/11,
pero no conocemos la configuración efectiva de aquel despliegue y no afirmamos que
esa haya sido la causa. Esas filas PUBLISHED no se reenvían al cambiar de driver.

El [ciclo climático](https://github.com/DappianoLuciano/DESAPPS2EspaciosPublicos/blob/6d2234b5f6d3bd21939352b9e4108fddf0ad200c/espacios-publicos-backend/src/application/use-cases/RunWeatherCycleUseCase.ts#L15)
finaliza alertas vencidas y usa el actor `system:weather-scheduler`. En esta rama,
cuando opera en citypass, selecciona confirmaciones marcadas con ese canal y el
Outbox espera que su confirmación esté PUBLISHED antes de enviar el cierre. Puede
explicar un cierre inesperado, pero confirmar un caso concreto requiere revisar
su alerta y logs. El envío ordenado entre dos tópicos no garantiza orden de consumo;
Residuos sigue conservando finales recibidos antes del inicio.

## Ajustes realizados en Residuos

- Se deduplica correctamente una reentrega de un schema anterior cuando Avro agrega
  defaults equivalentes: `barrios=[]` y temperaturas `null`. Los cambios reales de
  contenido o cobertura continúan generando conflicto.
- Los tipos de simulacro son opcionales: si faltan en el catálogo, se reciben los dos
  eventos reales y se informa su registro pendiente. Ya no bloquean la entrada real.
- Se añadieron pruebas contra el snapshot literal del schema del productor, el payload
  publicado de la captura, el cierre del scheduler y la transición entre schemas 26/28.

Pasaron **556 unitarios de backend**, **379 de frontend** y **112 E2E** con PostgreSQL
descartable. Cobertura de líneas: backend **92,05 %**, frontend **93,98 %**. Lint, tipado
y builds correctos.

## Acceso a EDA: comprobación anterior al cambio de red

HTTPS volvió a responder con un certificado válido, sin cambiar DNS ni omitir TLS.
OAuth de Residuos y el catálogo funcionan. Se registraron y comprobaron en la consola:

| Tipo propio de prueba | Schema observado | Versión |
| --- | --- | --- |
| `com.citypass.residuos.SimulacroClimaticoConfirmado` | 39 | 1 |
| `com.citypass.residuos.SimulacroClimaticoFinalizado` | 40 | 1 |

El catálogo mantiene los tipos climáticos de Espacios en los schemas 28 y 27.
Sin embargo, el broker externo `test.citypass.mrfranco.net.ar:9092` corta la conexión
con `ECONNRESET` antes de completar TLS. Ocurre tanto con KafkaJS como en una prueba
TLS sin credenciales; no se llegó a la autenticación Kafka. El README vigente de EDA,
commit `09468193c18221296b9f9dc35b621fb8f63e48c2`, indica 9092 y SASL_SSL en producción.
No se puede distinguir desde el cliente si el corte está en la red, proxy o listener.

Por eso hoy no se verificó una nueva recepción remota ni se publicaron eventos de
negocio de inicio/fin. La publicación HTTP de los schemas sí se completó. Queda
resolver el acceso al broker y después ejecutar [el recorrido por EDA](simulacro-clima-eda.md).

### Mensaje histórico para EDA (acceso ya recuperado)

Hola, desde Residuos funciona OAuth y el gateway HTTPS; registramos nuestros dos
tipos de simulacro (schemas 39 y 40). Pero `test.citypass.mrfranco.net.ar:9092` corta
la conexión antes de completar TLS con `ECONNRESET`, incluso sin enviar credenciales.
Usamos TLS + OAUTHBEARER como indica el README. ¿Podés revisar el listener/proxy y
el acceso externo al puerto 9092? La web funciona, pero todavía no podemos consumir.
