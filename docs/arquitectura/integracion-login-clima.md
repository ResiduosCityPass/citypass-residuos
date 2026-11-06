> Actualización del 03/11: integración sobre `develop` (#51–#68), transporte y
> consumidor unificados. Las cifras y comprobaciones remotas de las secciones
> históricas corresponden a sus fechas; no acreditan un nuevo despliegue.

# Integración de Residuos con Login y EDA

Se prepararon el [despliegue federado con EDA](../devops/preparacion-login-eda-2026-11-02.md)
y los [datos reproducibles de demo](datos-demo-inundacion.md). La validación de esta
preparación suma 569 unitarios backend y 118 E2E; el documento distingue las pruebas
correctas de la nueva limitación de conectividad Kafka. Todavía no se publicó esa versión.

Para probar sin el publicador de Espacios Públicos, se agregó el
[simulacro propio de Residuos por EDA](simulacro-clima-eda.md): dos tipos separados,
habilitados solo en desarrollo/test, que usan el mismo procesamiento de negocio.
El 02/11 sus tipos se registraron en EDA (schemas 39 y 40) y, después del cambio de red,
se completó el flujo por el bus real hasta RECUPERADA. Ver [resultado y evidencia](prueba-eda-real-2026-11-02.md)
y [revisión de la rama de Espacios Públicos](revision-espacios-publicos-2026-11-02.md).

Después se repitió la emisión desde la web de Espacios Públicos con una alerta nueva.
La web confirmó y finalizó, pero no aparecieron registros nuevos en sus tópicos y
Residuos no recibió ese ID. Ver [prueba del 02/11 desde Espacios Públicos](prueba-espacios-web-2026-11-02.md)
y [mensaje actualizado para su equipo](consultas-integracion-equipos.md#mensaje-actualizado-para-espacios-p%C3%BAblicos).

Implementación actualizada el 01/11/2026 con la guía de Login y el repositorio de EDA,
commit `09468193c18221296b9f9dc35b621fb8f63e48c2`.

Fuentes: [README de EDA](https://github.com/carlos-illobre/citypass-event-gateway),
[contrato de autenticación del bus](https://github.com/carlos-illobre/citypass-event-gateway/blob/main/docs/AUTH.md),
[contratos de eventos](https://github.com/carlos-illobre/citypass-event-gateway/blob/main/docs/CONTRACTS.md),
y la guía de integración LDAP enviada por el equipo de Login.

## Identidades confirmadas

| Uso | Cliente | Datos verificados |
| --- | --- | --- |
| Personal de Residuos | `citypass-residuos-web` | Issuer `https://idp.citypass.local`, audience `citypass-residuos-api`, módulo `residuos`, RS256/JWKS |
| Backend contra EDA | `grupo6` | Token `service`, namespace `com.citypass.residuos`, audience `citypass` |

El README tiene una tabla histórica que asigna `grupo6` a Turismo. La cuenta real fue
verificada criptográficamente y hoy pertenece a Residuos. No se toma el número de grupo como
namespace ni se reutiliza una identidad de otro módulo.

La guía LDAP dice que el token humano sirve para el bus. El gateway actual exige
`token_use=service`, tanto en documentación como en código. Por eso el backend publica con
su propia credencial OAuth; nunca reenvía la contraseña, access token o refresh token humano.

Se verificó en el IdP real: login de `delegado-res`, firma, issuer, audience, módulo,
refresh rotativo y logout. No se guardaron tokens de esa comprobación. El issuer es un
identificador textual: no se usa como URL para descargar claves.

Aunque la guía describe `aud` como lista, el IdP real devuelve también texto. Residuos
admite ambas representaciones y exige que incluyan su audiencia. En modo federado además
valida `module=residuos`, `token_use=human`, versión 1, expiración y firma RS256.

## Permisos del delegado

Política elegida explícitamente por Ramiro: el grupo LDAP `delegados` tiene rol
**OPERADOR**, sin permisos de ADMINISTRADOR. Los grupos quedan configurados así:

Cuando un token contiene varios grupos reconocidos, se resuelve un único rol
con prioridad **ADMINISTRADOR > OPERADOR > CHOFER**, independientemente del orden
en que Login entregue los grupos. El delegado sin otros grupos sigue siendo OPERADOR.

```dotenv
JWT_ADMIN_GROUPS=administrador
JWT_OPERATOR_GROUPS=operador,delegados
JWT_DRIVER_GROUPS=chofer
```

Los grupos y membresías se administran en Login con el delegado; no se crean desde
los endpoints de Residuos. Para el ensayo desplegado del 03/11 se creó `qa-admin-res`
con el único grupo `residuos-administradores`, sin modificar los grupos del delegado.
Los permisos de administración (por ejemplo crear camiones) siguen requiriendo administrador
y devuelven 403 al delegado. Las credenciales internas del chofer siguen con HS256 y su emisor propio;
no se mezclan con la sesión del personal.

## Sesión del frontend

- Formulario municipal en `/login`; la consulta ciudadana `/cerca` sigue siendo pública.
- Login: `{username,password,clientId}`; refresh/logout: `{refreshToken}`. Requests en
  camelCase y respuesta `access_token`/`refresh_token` en snake_case.
- Ambos tokens en `sessionStorage`, sin persistir contraseña ni secretos de EDA.
- Renovación preventiva a los 13 minutos para el vencimiento de 15 minutos. También
  reintenta una vez un 401 del backend. Solicitudes concurrentes comparten un solo refresh.
- Conserva siempre el refresh nuevo. Un 403 no refresca; un refresh revocado vuelve al login.
- Logout borra el estado inmediatamente y solicita revocación al IdP. Una renovación tardía
  no puede restaurar la sesión cerrada; su refresh también se revoca.
- El backend sigue autorizando cada request. `GET /api/v1/auth/sesion` informa la identidad
  y el rol efectivamente resueltos por el servidor.

Se comprobó que el IdP permite el origen `http://localhost:5173` en CORS. Para otra URL de
frontend hay que verificar o pedir el alta de ese origen.

## Recepción desde EDA

Se reutilizan **GatewayTransporte** y **CitypassKafkaConsumer** incorporados en
`develop`. Outbox, CLI de catálogo y SASL/OAUTHBEARER comparten un solo token OAuth
de servicio y las variables `GATEWAY_*`. Kafka usa `KAFKA_BROKERS`, `KAFKA_SSL` y
`KAFKA_GROUP_ID`. No hay un segundo cliente, token ni consumidor climático.
El gateway y el broker validan la identidad de servicio; la validación RS256/JWKS
de los tokens humanos permanece en el backend de Residuos.

Se consumen `com.citypass.espacios.CriticidadClimaticaConfirmada` y
`com.citypass.espacios.CriticidadClimaticaFinalizada`, junto con los eventos de
Reclamos, Emergencias y Espacios que ya procesa `IntegracionService`.
Kafka resuelve las versiones existentes al suscribirse por namespace. Los schemas
se leen del framing Confluent y del endpoint público `/api/v1/schemas/ids/{id}`.

Los dos canales (Kafka y webhook autenticado por `GATEWAY_WEBHOOK_TOKEN`) llaman a
`IntegracionService.procesar`. Los mensajes climáticos pasan por su inbox con hash,
validación de tipo/tópico/schema y transacción con el outbox; no se insertan antes
en el inbox genérico. Una entrega repetida por ambos canales es idempotente.

Se confirma **offset + 1** con BigInt después del guardado. Fallos transitorios de
base, registry o commit dejan el offset pendiente para reintentar. Mensajes
permanentemente inválidos (framing, Avro, schema inexistente o contrato rechazado)
se registran en el log y se descartan, como en #68, para no trabar la partición.

El grupo cloud es `com.citypass.residuos.api`; local usa otro grupo. Las primeras
suscripciones usan `fromBeginning=false`: no se reproducen emergencias históricas
que podrían bloquear zonas antiguas. Un grupo con offsets ya confirmados retoma
desde ellos. La pantalla `/contingencias/clima` muestra el estado del único consumidor.

## Afectación y recuperación

El schema real de confirmación incluye `alertaId`, criticidad, fenómeno, coordenadas,
`barrios` opcionales por defecto, vigencias Unix en milisegundos, temperaturas y `actorSub`.
El `alertaId` se conserva como texto: el schema no exige UUID. El fin lleva solamente
`alertaId`, `finalizadaEn`, `actorSub`.

1. Se guarda el evento y queda pendiente de revisión. Ni las coordenadas ni un barrio
   informado se convierten en un radio o polígono inventado: nuestras zonas son agrupaciones
   lógicas de contenedores.
2. El operador determina si hay inundación que impida recolectar. Selecciona las zonas y
   fundamenta la suspensión, o registra que no hay afectación.
3. La suspensión conserva paradas pendientes, llenado y alertas. Los bloqueos manuales se
   mantienen independientes.
4. El evento final pasa a pendiente de recuperación. `vigenciaHasta` no levanta restricciones.
5. El operador habilita la recuperación; vaciados reales completan el trabajo acumulado,
   incluyendo contenedores que no llegaron al umbral crítico.

Un cierre recibido antes del inicio queda guardado y no puede reabrirse por una entrega
retrasada. La misma alerta/etapa con otro contenido se rechaza hasta que exista un contrato
explícito de actualización. Los campos opcionales ausentes y su representación JSONB no
producen falsos conflictos al reentregar.

## Respuestas a los demás módulos

El driver `platform` despacha el outbox a `POST /api/v1/event-types/{fqn}/events`, con
el token de servicio. Envía solo `data`; el gateway calcula su propia metadata.

| Evento interno | Tipo publicado |
| --- | --- |
| `residuos.servicio.afectado` | `com.citypass.residuos.ServicioAfectado` |
| `residuos.recuperacion.pendiente` | `com.citypass.residuos.RecuperacionPendiente` |
| `residuos.recuperacion.habilitada` | `com.citypass.residuos.RecuperacionHabilitada` |
| `residuos.servicio.restablecido` | `com.citypass.residuos.ServicioRestablecido` |

Estos cuatro tipos contienen `inundacionId` local, `alertaId` externo, estado, zonas y actor
cuando corresponde. `correlationId` referencia la alerta externa. `eventId` en **data** es
el ID estable del outbox de Residuos: permite deduplicar publicaciones repetidas si se pierde
la respuesta HTTP. El `metadata.eventId` del gateway puede ser nuevo en cada POST.

Se conservan las traducciones de `develop`: alertas → `AlertaGenerada`, vaciados →
`RecoleccionCompletada`, refuerzos, reclamos e intervenciones. Rutas y omisiones
siguen siendo eventos internos. El [JSON climático](../contratos/eda-residuos.json)
contiene únicamente las cuatro respuestas nuevas y está validado con Avro.
La herramienta registra solo tipos faltantes del namespace de Residuos; no edita ni elimina
contratos existentes. Si un contrato existente difiere, informa el conflicto.

```bash
cd backend
npm run eda:plan
# Verificar OAuth, catálogo y conexión TLS al broker (sin publicar ni mover offsets):
ENV_FILE=.env.integration.local npm run eda:verificar -- --kafka
# Registrar los tipos faltantes, sin emitir eventos de negocio:
ENV_FILE=.env.integration.local npm run eda:registrar -- --apply
```

Un error del gateway conserva el evento en el outbox, con el backoff y límite de reintentos
existentes. Los errores no guardan ni imprimen credenciales. `inmemory` sigue disponible
para pruebas aisladas.

## Configuración y prueba local

Se agregaron perfiles `.env.integration.example` en backend y frontend. Sus copias
`.env.integration.local` están ignoradas por Git. Los secretos viven solo en el backend.
Para preparar otro entorno, copiar los ejemplos, completar el secreto de servicio y generar
un `JWT_SECRET` exclusivo de Residuos para las credenciales del chofer.

La base de la demo local real es independiente de la base de tests y de la simulación anterior.
El perfil apunta a PostgreSQL local, API 3038 y frontend `http://localhost:5173`:

```bash
# Backend, con PostgreSQL disponible y los datos del perfil local ajustados:
cd backend
ENV_FILE=.env.integration.local npm run start:dev

# En otra terminal:
cd frontend
npm run dev -- --mode integration --host localhost --port 5173
```

1. Iniciar sesión con la cuenta municipal de Residuos. El delegado debe verse como OPERADOR.
2. Abrir Inundaciones → Revisar eventos de Espacios Públicos. Confirmar **Kafka conectado**.
3. Pedir a Espacios Públicos una confirmación de prueba y verificar que aparece con su
   `alertaId`. El operador selecciona zonas locales y fundamenta la afectación.
4. Verificar las restricciones en rutas/mapa y los eventos de Residuos en EDA.
5. Espacios Públicos finaliza la misma alerta. Habilitar recuperación y completar los vaciados.

El simulador queda apagado en este perfil conectado al bus. Para probar sin otros equipos,
usar el entorno aislado con `inmemory` y simulador habilitado; se conserva el flujo anterior.
La guía anterior de simulación está en [contingencias-inundacion.md](contingencias-inundacion.md).

## Validación

Hay pruebas unitarias de sesión, firmas, permisos, OAuth de servicio, contratos Avro,
publicación, recepción, deduplicación y orden del acuse. Los E2E usan PostgreSQL descartable,
las migraciones reales, un gateway HTTP local que valida Avro y tokens RSA de prueba.
Las comprobaciones remotas se informan separadamente de esos tests reproducibles.


Validación final del 01/11/2026: **536 tests unitarios de backend**, **377 de frontend** y
**109 E2E** pasaron. Cobertura global de líneas: backend unitario **91,87%**, frontend
**93,98%**. También pasaron lint, tipado y builds.

En la prueba histórica del 01/11 se registraron diez schemas de Residuos en el gateway real y se repitió el registro para
confirmar que los reconoce sin modificarlos. En Chrome se probó login/logout reales y se
recibieron dos mensajes históricos de Espacios Públicos, con el delegado como OPERADOR y
Kafka conectado. No se emitieron eventos de negocio en el bus compartido durante esas
comprobaciones. El flujo completo y sus fallos se verificaron con el gateway local de los E2E;
queda coordinar con Espacios Públicos una nueva alerta de prueba y su finalización para la
demostración entre equipos.

Posteriormente, el 01/11 alrededor de las 21:13–21:18 de Argentina, se intentó esa
demostración desde la aplicación real de Espacios Públicos. Se creó, confirmó y finalizó
un simulacro nuevo, pero sus mensajes no llegaron a los tópicos climáticos de EDA.
Las publicaciones de generación y asignación de ruta de Residuos sí llegaron al bus.
Por tanto, la suspensión y recuperación completa entre equipos sigue pendiente de
resolver la entrega desde el emisor. Ver [resultado y evidencia de la prueba](prueba-clima-real-2026-11-01.md)
y [mensaje para coordinar la revisión](consultas-integracion-equipos.md#incidencia-encontrada-en-la-prueba-real).
