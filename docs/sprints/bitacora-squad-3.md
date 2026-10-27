# Bitácora · Residuos en el squad 3

Lo que fuimos haciendo y decidiendo, para contarlo en la exposición del Hito 2 (jue 19/11).

**Caso:** "Recolección inteligente después de un evento masivo". Termina un evento en una plaza y Residuos manda una escuadrilla a limpiar los tachos de la zona.
**Mi parte (Máximo, Residuos):** recibir `ActividadCreada` de Espacios, marcar los tachos cercanos, armar el recorrido de la escuadrilla al terminar el evento y que el chofer lo cierre.

## Jue 22/10 · Arranque

**Qué pide la consigna (Hito 2, 19/11):** módulo integrado, participar en al menos un caso de uso transversal, evidencia de colaboración entre squads, documentación completa y una demo unificada con eventos reales. Está en `docs/catedra/01 - Presentación de la Materia.pdf`.

**Qué acordamos en el squad:** el diagrama del squad tiene un solo evento, `ActividadCreada`, que publica Espacios. Reaccionan cuatro módulos: Residuos (escuadrilla de limpieza), Reclamos (vincula los reclamos de la zona), Emergencias (recursos en el rango) y Movilidad (reabastece las estaciones de bici).

**Decisión: achicar el alcance.** Armé un plan grande con 4 eventos, pero el squad marcó que había cosas fuera de lo acordado. Me quedo con lo del diagrama: un evento y la escuadrilla. Mi plan corto está en `docs/sprints/plan-maximo-residuos.md`.

**Mensajes que mandé:**
- Al squad 3: qué voy a hacer desde Residuos y qué necesito de cada uno.
- Al grupo 4: todavía no lo mandé. Les tengo que avisar que voy a tocar el módulo `integracion` y el webhook, que comparto con otros casos.

**Lo que respondieron:**
- **Rodrigo (Espacios):**
  - El evento ya existe adentro de Espacios (`cultura.evento_comunitario_publicado`). En el bus va a salir como `com.citypass.espacios.ActividadCreada`.
  - Los campos son: `communityEventId`, `capacity`, `status` (`ACTIVE`, `ACTIVE_FULL` o `CANCELLED`), `startDate` y `endDate` (ISO 8601, UTC).
  - Las coordenadas todavía no las tiene: va a sumar `latitude` y `longitude`. Mientras tanto las simulo en local.
- **Franco (EDA):**
  - Sin autenticarse, desde el 23/10 el bus no muestra eventos, así que hace falta un token de servicio.
  - Los namespaces no los define el EDA. Salen del token del Login.

**Qué queda pendiente de otros:**
- Nicolas Hernandez (Login): el token de servicio y el namespace `com.citypass.residuos`. Recién hace falta para conectar con el bus real.
- Grupo 4: avisar que voy a tocar `integracion`. Además, el código de Nico para este mismo evento espera otros nombres de campos (`cupoMaximo`, `latitud`, `fin`), así que con el evento real de Rodrigo no se activaría.

## Jue 22/10 · Paso 1: Residuos recibe `ActividadCreada`

Rama `feat/squad3-actividad-creada`, creada desde `develop`.

**Qué hace:** cuando llega `com.citypass.espacios.ActividadCreada` al webhook `POST /webhooks/citypass`, Residuos:
1. Descarta los eventos repetidos (por `eventId`). Esto ya lo hacía el código de Nico.
2. Ignora la actividad si es chica (menos de 1.000 personas), si está cancelada o si no trae coordenadas.
3. Busca los contenedores a 300 m o menos de la actividad.
4. Guarda la actividad en la tabla nueva `actividad_masiva`: título, capacidad, centro, inicio, fin y contenedores cercanos.

**Decisiones:**
- Uso los nombres de campos que pasó Rodrigo, en inglés, tal cual: así no hay que traducir nada.
- El corte de 1.000 personas es propio (`INTEGRACION_CAPACIDAD_MASIVA`). No toca el de 100 que usa Nico para su caso.
- Reuso lo que ya existía: el webhook, el descarte de repetidos y la búsqueda de contenedores cercanos.

**Archivos:**
- `backend/src/modules/integracion/domain/actividad-masiva.entity.ts`: la tabla nueva.
- `backend/src/migrations/1792708905000-ActividadMasiva.ts`: la migración que la crea.
- `backend/src/modules/integracion/application/integracion.service.ts`: la reacción al evento.
- `integracion.repository.ts`, `integracion.typeorm.repository.ts` e `integracion.module.ts`: guardar la actividad.

**Pruebas:**
- 6 tests nuevos: guarda con los contenedores cercanos, ignora menos de 1.000, ignora cancelada, ignora sin coordenadas, no toca el refuerzo de Nico y rechaza una fecha inválida. Los 24 tests del módulo pasan.
- En local, mandé al webhook un evento de ejemplo: "Festival de Primavera", 5.000 personas, al lado del contenedor CT-0004.
  - La primera vez respondió 204 y la actividad quedó guardada con 1 contenedor cerca.
  - Repetido: 204, pero no se guardó de nuevo.
  - Sin token: 401.

Para repetir la prueba (backend levantado y `GATEWAY_WEBHOOK_TOKEN=local-dev` en `backend/.env`):

```bash
curl -X POST "http://localhost:3000/api/v1/webhooks/citypass?token=local-dev" \
  -H 'Content-Type: application/json' \
  -d '{"metadata":{"eventId":"prueba-act-1","eventType":"com.citypass.espacios.ActividadCreada"},"data":{"communityEventId":"3f1c2a9e-0000-4000-8000-000000000001","title":"Festival de Primavera","capacity":5000,"status":"ACTIVE","startDate":"2026-10-23T18:00:00Z","endDate":"2026-10-23T23:00:00Z","latitude":-34.5990,"longitude":-58.3815}}'
```

## Jue 22/10 · Paso 2: la zona del evento en el mapa

**Qué se ve:** en la pantalla del mapa (CU-07), cada actividad masiva aparece así:
- Un círculo azul punteado de 300 m alrededor del lugar. Al pasar el mouse muestra el título, la capacidad y la hora de fin.
- Un aviso arriba del mapa, por ejemplo: "Actividad masiva: Festival de Primavera · 5.000 personas · Termina a las 20:00 (en 2 h 15 min) · 1 contenedor en la zona".
- La cuenta regresiva se actualiza sola con cada refresco del mapa (cada 30 s).

**Cómo funciona:**
- Backend: endpoint nuevo `GET /actividades-masivas`, para operador y administrador. Devuelve las actividades que todavía no terminaron y las que terminaron hace menos de 6 h, que es cuando la escuadrilla está limpiando.
- Frontend: la pantalla del mapa le pide las actividades a ese endpoint cada vez que se refresca. Si ese pedido falla, el mapa de contenedores sigue andando igual, solo que sin las zonas.

**Decisiones:**
- El círculo va en azul porque el verde, el ámbar, el rojo y el gris ya son los colores de estado de los contenedores. Si usara uno de esos, se confundirían.
- El círculo se dibuja debajo de los contenedores, así no tapa el click en un marcador.
- Las horas se muestran en hora de Buenos Aires y en formato 24 h.
- Agregué la actividad a los datos de demostración (mocks), así la pantalla se puede mostrar sin backend.

**Archivos:**
- Backend: `actividades-masivas.controller.ts` (nuevo), `integracion.service.ts`, el repositorio y el módulo.
- Frontend: `domain/massEvents.js` (nuevo: hora de fin y cuenta regresiva), `components/ContainersMap.jsx`, `pages/MapPage.jsx`, `api/waste.js`, `api/waste.http.js` y `mocks/server.js`.

**Pruebas:**
- Backend: 1 test nuevo, el del endpoint para el mapa. Pasan los 25 del módulo.
- Frontend: 6 tests nuevos (4 de la cuenta regresiva y 2 de la pantalla). Pasan los 327.
- En el navegador, contra el backend local: se ve el aviso y el círculo del "Festival de Primavera" que mandé en el paso 1, sin errores en la consola.

**Próximo paso:** a la hora de fin, armar el recorrido de la escuadrilla (paso 3).

## Jue 22/10 · Coordinación con Adriel (grupo 4)

Adriel me pasó lo que planea para su caso: cuando se resuelve una emergencia relacionada con residuos, programar una intervención en el contenedor más cercano.

**Problema:** lo analizó sobre `main`, que todavía no tiene lo de Nico (#52). Por eso concluyó que "no hay bus ni consumidor" y planeaba armar otra puerta de entrada (`POST /eventos/entrantes`). En `develop` eso ya existe: el publicador al bus (driver `gateway`), el webhook `POST /webhooks/citypass` con descarte de repetidos y el módulo `integracion`, que ya reacciona a eventos de Emergencias.

**Qué le propuse:** que trabaje sobre `develop` y entre por el mismo webhook, agregando su caso al `switch` de `IntegracionService`, como hice yo con `ActividadCreada`. Así todos los casos usan una sola entrada y no se duplica nada. Como Nico ya maneja `EmergenciaActualizada`, los dos tienen que ponerse de acuerdo.

**Fran (grupo 4)** me pidió el detalle completo del caso: qué recibo, qué mando y qué toco. Le mandé un resumen para que no nos pisemos en el módulo `integracion`.

## Jue 22/10 · Paso 3: la escuadrilla a la hora de fin

**Qué hace:** cuando llega una actividad masiva, además de guardarla, Residuos agenda la escuadrilla. Desde la hora de fin y durante 6 h, los contenedores de la zona entran a la ruta que arma CU-08, aunque no estén críticos. Así, cuando el operador genera la ruta después del evento, la escuadrilla pasa por todos los tachos de la plaza, no solo por los que ya están llenos.

**Decisión: reusar el refuerzo de Nico (CU-INT-01).** Su caso ya tenía un "refuerzo": contenedores que entran al ruteo durante una ventana de tiempo. Para la escuadrilla guardo uno igual, sin tocar su código:
- El id lleva el prefijo `act-`, así no pisa los refuerzos de Nico.
- La ventana arranca a la hora de fin y dura 6 h.
- No publica el aviso de refuerzo de Nico (`residuos.refuerzo.programado`).
- Si no hay contenedores cerca, guarda la actividad igual pero no agenda escuadrilla.

**Por qué no se arma la ruta sola:** en CU-08 la ruta la propone el sistema y la confirma una persona, porque elegir camión y chofer es decisión del operador. La escuadrilla respeta eso: el sistema ya sabe qué tachos levantar y el operador solo aprieta "Generar ruta".

**Archivos:** solo `integracion.service.ts` y su test. El módulo `rutas` no se tocó: ya leía los refuerzos.

**Pruebas:**
- 2 tests nuevos: agenda la escuadrilla con la ventana correcta, y sin contenedores cerca no agenda nada. Pasan los 105 de `integracion` y `rutas`.
- En local, de punta a punta:
  1. Mandé un "Recital en Plaza Constitución" (3.000 personas) que había terminado hacía 10 min, al lado del contenedor CT-0005, que estaba NORMAL al 35 %.
  2. Generé una ruta para el camión de reciclables (XY987ZW).
  3. CT-0005 apareció en la ruta junto con los críticos. Sin la escuadrilla no habría entrado, porque no estaba crítico.
  4. Después descarté la ruta de prueba.

**Próximo paso:** el chofer confirma las paradas (paso 4). CU-10 ya existe: queda probarlo con una ruta de escuadrilla.

## Jue 22/10 · Paso 4: el chofer cierra la ruta de la escuadrilla

**No hizo falta código nuevo.** La confirmación del chofer (CU-10) ya existía y funciona igual con una ruta de escuadrilla: para el chofer es una ruta más.

**Prueba de punta a punta en local, con el "Recital en Plaza Constitución" del paso 3:**
1. El operador generó la ruta para el camión de reciclables (XY987ZW): 6 paradas, 5 contenedores críticos más CT-0005, el tacho de la plaza que entró por la escuadrilla.
2. El operador se la asignó a la chofer Juana Perez.
3. Juana la vio en su pantalla (`/chofer`): "0 de 6 vaciados". CT-0005 aparece en verde porque no estaba lleno.
4. Juana confirmó las 6 paradas, cada una desde la posición del contenedor. El backend valida que esté a menos de 100 m.
5. La ruta pasó a COMPLETADA, los contenedores quedaron vacíos (NORMAL, 0 %) y la pantalla de Juana volvió a "No tenés ninguna ruta asignada".

**Con esto se cumple el "listo cuando" de mi parte:** llega `ActividadCreada`, se ve la zona en el mapa, a la hora de fin la escuadrilla tiene los tachos de la plaza en su ruta y el chofer la cierra.

**Próximo paso:** probarlo con el evento real que publique Rodrigo por el bus (paso 5). Para eso faltan el token de servicio y el namespace del Login, y las coordenadas en Espacios.

## Jue 22/10 · PR #57 a `develop`

Abrí el PR [#57](https://github.com/ResiduosCityPass/citypass-residuos/pull/57) con los pasos 1 a 4. Le pedí la revisión a Nico, porque el PR suma cosas al módulo `integracion`, que es de su caso.

## Jue 22/10 · Documento de Fran con todos los casos del grupo 4

Fran juntó en un documento los casos de integración de todos los del grupo 4, para no pisarnos en el repo:
- **Fran:** un reclamo por un auto que tapa un contenedor.
- **Yo:** el evento masivo.
- **Tomás:** la reserva de una plaza más la limpieza a la salida.
- **Adri:** una emergencia durante un viaje en bici.

**Coincide con lo que hicimos:**
- Todos entramos por el mismo webhook.
- El refuerzo es el mecanismo común: lo usamos Nico, Tomás y yo.
- La ruta la sigue generando el operador.

**Lo que propone y me afecta:**
- **Un service propio por caso** dentro de `integracion`, para que en el `switch` compartido haya solo una línea por caso.
- **No responder 400** si el evento llega mal formado. Un 400 hace que el bus lo reintente para siempre: mejor ignorarlo y dejarlo en el log.
- **Tomás trabaja sobre mi rama:** agrega el refuerzo desde 100 personas, publica `RefuerzoProgramado` para Analítica y maneja la cancelación.
- **Orden de merge:** primero los PRs de Fran (#53 → #58) y después el mío (#57), resolviendo conflictos chicos en `integracion`.

## Jue 22/10 · Ajustes al PR #57 según las reglas del grupo 4

Apliqué las dos reglas que propuso Fran para que los casos no choquen en el módulo `integracion`.

**1. Un service propio por caso.**
- Todo lo de mi caso pasó a un archivo propio: `application/actividades-masivas.service.ts` (`ActividadesMasivasService`). Ahí está guardar la actividad, agendar la escuadrilla y dar las zonas para el mapa.
- En el archivo que tocamos todos (`integracion.service.ts`) solo quedan 6 líneas agregadas: el `case` de `ActividadCreada`, que llama a mi service, y lo necesario para conectarlo. Volví a dejar el resto del archivo exactamente como en `develop`, sin tocar lo de Nico.
- El endpoint del mapa (`GET /actividades-masivas`) ahora usa mi service.
- **Por qué:** cuanto menos se toque el archivo compartido, menos conflictos hay al mergear los PRs de Fran, Tomás y Adri.

**2. Un evento mal formado se ignora, no responde 400.**
- Si a `ActividadCreada` le falta el id, las coordenadas o una fecha válida, Residuos lo ignora, deja un aviso en el log y responde 204.
- **Por qué:** con un 400 el bus cree que falló y lo reintenta para siempre. Con 204 lo da por entregado.

**Pruebas:**
- Los tests de mi caso pasaron a su propio archivo, `actividades-masivas.service.spec.ts`: 11 tests, incluidos 4 de eventos mal formados (sin coordenadas, sin id, fecha de fin inválida, sin fecha de inicio).
- En el test de Nico agregué uno solo: que `ActividadCreada` se manda a mi service.
- Pasan los 108 tests de `integracion` y `rutas`.
- En local:
  - Un evento sin id respondió 204, quedó en el log ("ActividadCreada ignorada, mal formada") y no se guardó nada.
  - Una "Feria en Plaza de Mayo" válida se guardó con su contenedor cercano.

## Jue 22/10 · Documentación y script de demo

Mientras espero a los demás (la aprobación de Nico, el token de Nicolas, las coordenadas de Rodrigo), avancé con lo que pide la consigna para el Hito 2 y no depende de nadie.

**1. Contrato del evento** (`docs/arquitectura/contratos-de-eventos.md`, en "Eventos a los que nos suscribimos"):
- Quién publica `ActividadCreada` y cómo llega (el webhook, con el sobre del bus).
- Un JSON de ejemplo y una tabla con cada campo y para qué lo usa Residuos.
- Qué hace Residuos paso a paso: el corte de 1.000 personas, los 300 m, la zona en el mapa y la escuadrilla.
- Qué pasa con un evento mal formado (se ignora y responde 204) y que Residuos no publica nada en respuesta.

**2. Diagrama de secuencia del caso** (`docs/arquitectura/diagramas.md`, sección 8):
- El recorrido completo: Espacios → bus → API de Residuos → base de datos → operador → chofer.
- Muestra los casos que se ignoran (repetido, mal formado, cancelada, chica) y que guardar la actividad y la escuadrilla van en una sola transacción.
- Explica por qué la ruta no se arma sola y por qué se reusa el refuerzo de Nico.
- Reemplaza al diagrama de flujo del squad, que tenía restos de la plantilla, y responde a lo que pide la consigna: "diagramas de interacción".
- Lo verifiqué dibujándolo en el navegador: se ve bien.

**3. Script de demo** (`simulator/actividad-masiva.js`, comando `npm run actividad`):
- Hace de Espacios: manda `ActividadCreada` al webhook igual que el bus.
- `--contenedor CT-0005` arma la actividad al lado de ese contenedor, así la escuadrilla seguro tiene algo que levantar.
- `--termina-en 0` hace que ya haya terminado, para mostrar la escuadrilla sin esperar.
- **Es el plan B de la exposición:** si el bus o Espacios se caen en vivo, la historia sigue con este comando.
- Probado en local: con `--contenedor CT-0016` la zona apareció en el mapa con 2 contenedores. Sin token, avisa qué falta.
- Lo expliqué en `simulator/README.md`.

**Comando para la demo** (con el backend levantado):

```bash
cd simulator
TOKEN=<token-de-administrador> npm run actividad -- --contenedor CT-0005
```

## Mar 27/10 · Esperando respuestas

Desde el 22/10 nadie respondió y no se movió nada:
- #57 sigue esperando la aprobación de Nico. Antes van los PRs de Fran (#53 y #58), también sin aprobar.
- Nicolas todavía no pasó el token de servicio ni el namespace `com.citypass.residuos`.
- Rodrigo todavía no agregó `latitude` y `longitude` al evento.
- Tomás todavía no abrió su PR sobre mi rama.

Les mandé un recordatorio a los cuatro. Mientras tanto, el paso 5 (el bus real) sigue bloqueado.

## Mar 27/10 · El paso 5 queda listo para cuando lleguen los datos

Para no perder días cuando Nicolas y Rodrigo respondan, dejé todo armado. Cuando lleguen los datos, conectarse al bus es pegarlos y correr un comando.

**Lo que aprendí leyendo el repo del bus:**
- Para recibir eventos por webhook hay que darse de alta: `POST /api/v1/subscriptions` con el tipo de evento y la URL pública del webhook. El bus devuelve un `id`, que sirve para darse de baja.
- El token sale del Login (Grupo 2) con un `client_id` y un secreto por grupo. La tabla de clientes del bus todavía no tiene a Residuos: `grupo4` figura como `com.citypass.reclamos`. Sigue haciendo falta lo de Nicolas.
- Si el webhook no responde, el bus reintenta 3 veces y deja el evento en una cola de fallidos. Render gratis tarda más de 15 s en despertar, así que hay que despertar la API antes de probar.
- Falta saber la URL pública del bus: en los documentos figura un dominio de ejemplo.

**Lo que hice:**
- `simulator/bus.js` (`npm run bus`): suscribe el webhook, lista las suscripciones, muestra los eventos que no llegaron y da de baja. Antes de suscribir, prueba que el webhook de Render esté despierto y que el secreto esté bien.
- En `render.yaml` sumé `GATEWAY_WEBHOOK_TOKEN`, que se carga a mano en Render y nunca va al repo.
- En `docs/sprints/plan-maximo-residuos.md` escribí los 5 pasos para cuando lleguen los datos. Uno importante: Render despliega `main`, así que mi código tiene que llegar a `main` antes de probar.
- Lo probé contra un bus falso y el backend local: suscribir, listar, fallidos y baja funcionan, y avisa si el secreto está mal o falta un dato.

## Mar 27/10 · Espacios publica con los campos del contrato del squad

**Qué pasó en el grupo del squad:**
- Wanda (Movilidad) le pidió a Rodrigo que `ActividadCreada` salga con los campos del contrato del squad (E1 en `plan-squad-3.md`), y Rodrigo confirmó: al publicar en el bus, Espacios traduce su evento interno a ese contrato. Así todos los módulos consumen lo mismo.
- Franco (EDA) confirmó que el namespace sale de la tabla del README del bus y del token del Login.
- Reclamos usa el mismo corte que nosotros: 1.000 personas, 300 m y 6 h.

**Por qué nos tocaba:** Residuos esperaba los nombres viejos (`communityEventId`, `title`, `startDate` en ISO, `latitude`...). Con el evento real, lo habría ignorado por mal formado y la escuadrilla nunca salía.

**Lo que cambié** (solo lo que lee Residuos, nada de lo que publica Espacios):
- `ActividadesMasivasService` ahora lee `actividadId`, `titulo`, `capacidad`, `estado`, `fechaHoraInicio` y `fechaHoraFinalizacion` en milisegundos, y `ubicacion: { lat, lng }`.
- La cancelada ahora es `estado = CANCELADA` (hoy siempre llega `PROGRAMADA`).
- El script de demo (`npm run actividad`) manda el formato nuevo.
- Contrato actualizado en `docs/arquitectura/contratos-de-eventos.md`.
- Tests del módulo de integración, lint y tipos en verde.
- Probado en local con `npm run actividad -- --contenedor CT-0005 --termina-en 0`: la zona apareció en `GET /actividades-masivas` con 1 contenedor.

**Sigue pendiente:**
- Residuos todavía no figura en la tabla de namespaces del bus. Hay que pedirle el cliente a Nico Hernández (Login).
- La URL pública del bus.
- El README del bus dice que el servicio de webhooks puede no estar desplegado y Franco recomienda Kafka. Hay que preguntarle si el de webhooks está arriba.
