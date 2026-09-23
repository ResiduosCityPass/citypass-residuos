# Guion de la demo — Hito 1 (24/09)

> **Qué pide el hito:** *"Módulo funcional **sin integración** + UML + evidencia"*.
> No hay que mostrar integración con otros squads: hay que mostrar que **el módulo funciona solo**.
> Esa es una ventaja, no una limitación — se demuestra el ciclo completo sin depender de nadie.

**Duración objetivo: 12 minutos.** Se ensaya entero al menos una vez el día anterior.

---

## La idea: una sola historia, no un tour de pantallas

La tentación es recorrer las diez pantallas una por una. **No hagan eso.** Diez pantallas sin hilo
son diez cosas que el evaluador tiene que conectar solo, y no las va a conectar.

La demo cuenta **una historia**, la que justifica que el módulo exista:

> Un contenedor se llena → el sistema lo detecta solo → avisa → se arma un recorrido →
> un chofer lo ejecuta → el contenedor vuelve a estar disponible y la alerta se cierra.

Todo lo demás —el ABM de zonas, la flota, la predicción— entra **dentro** de esa historia, en el
momento en que hace falta. Un caso de uso que aparece cuando lo necesitás se entiende; el mismo
caso de uso mostrado suelto es una pantalla más.

Los 12 casos de uso quedan cubiertos por el recorrido, sin nombrarlos de a uno.

---

## Antes de empezar

### Media hora antes

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

```bash
cd backend && npm run migration:run && npm run start:dev
```

```bash
cd frontend && npm run dev
```

Verificar que responda: `http://localhost:3000/api/v1/health` y `http://localhost:5173`.

### Sembrar el escenario

```bash
cd backend && npm run token:dev -- ADMINISTRADOR
```

```bash
cd simulator && TOKEN=<el-token> npm run seed
```

Esto crea una zona con umbral 70%, contenedores alrededor del Obelisco y sus sensores.

### Dejar el simulador corriendo

```bash
cd simulator && npm start
```

**Dejalo corriendo un rato antes de la demo, no lo arranques en vivo.** Dos razones: la predicción
(CU-12) necesita al menos 3 lecturas del ciclo actual para tener algo que ajustar, y el mapa se ve
mucho mejor con contenedores en distintos niveles que con todos en cero.

> **El simulador recuerda los niveles entre corridas**, en `estado.json`. Eso es lo que permite
> encadenar dos escenarios sin que el contenedor que acabás de saturar vuelva a verde solo al
> arrancar el siguiente. Para empezar de cero a propósito:
>
> ```bash
> cd simulator && node simulador.js --reiniciar
> ```

### Preparar los tokens del frontend

```bash
cd backend && npm run token:dev -- ADMINISTRADOR
cd backend && npm run token:dev -- CHOFER
```

Van en `frontend/.env.local` como `VITE_DEV_TOKEN` y `VITE_DEV_TOKEN_CHOFER`. Duran 8 horas: si
la demo es a la tarde y los generaste a la mañana, **regeneralos**.

### Dejar a Juana Perez intacta

El seed crea a **Juana Perez** con la sesión `dev-chofer`, que es la que resuelve el token de
`npm run token:dev -- CHOFER`. **Es tu plan B: no le emitas una credencial.**

Emitir una credencial rota el identificador de sesión del chofer, así que hacerlo sobre Juana deja
inservible el token que preparaste. En la demo se da de alta un chofer nuevo (paso 6) y se le
emite a ese.

### Limpiar lo que dejaron los ensayos

**El halo naranja no se apaga solo.** Sale de tener una alerta de `INCENDIO` abierta, no de la
temperatura del momento, así que cada ensayo deja contenedores con halo que van a seguir ahí en la
demo real. Lo mismo con las alertas de saturación.

Antes de empezar, entrá a `/alertas` y **resolvé todo lo que quedó de los ensayos**. Si quedó muy
sucio, resembrá desde cero:

```bash
cd simulator && node simulador.js --reiniciar
```

Media hora ensayando y un mapa con seis halos hace que el incendio de verdad no se note.

### El chofer que deja la migración

La migración de choferes convierte los `choferId` de texto libre que ya estaban en la base: por
cada valor distinto crea un chofer, con ese texto de nombre **y** de legajo, y `usuarioSub` en
`NULL`. Funciona, pero deja choferes con nombre de identificador **visibles en el listado del ABM
y en el selector de "Asignar a"**. Pueden ser varios, y se llaman como sea que estuviera escrito en
la base: **el `SELECT DISTINCT "choferId"` que se corre antes de migrar dice cuántos y cuáles**.

La idea es darlos de baja: la baja es lógica, y el listado y el selector muestran solo activos, así
que desaparecen de los dos lugares sin perder el historial de sus rutas.

**Si alguno tiene una ruta abierta, la baja falla con `CHOFER_CON_RUTA_ACTIVA`**, y esa ruta no se
puede cerrar ni reasignar desde el operador: asignar solo acepta rutas en `PROPUESTA`, y las
paradas solo las cierra el rol `CHOFER`. Con `usuarioSub` en `NULL`, nadie puede entrar como él.
Lo que sí funciona, en este orden:

1. **Emitirle una credencial** desde `/choferes`.
2. **Entrar con esa credencial en `/chofer`**, en otra pestaña, y **omitir las paradas que
   queden**. Omitir pide un motivo, no la posición, así que se hace desde el escritorio. Con la
   última parada cerrada, la ruta pasa a `COMPLETADA` y el camión vuelve a `DISPONIBLE`.
3. **Recién ahí, darlo de baja.**

Un chofer migrado sin rutas abiertas se da de baja directo. **Todo esto va el domingo, después de
desplegar, no el día de la demo.**

### Tener a mano, en pestañas ya abiertas

| Pestaña | Para qué |
|---|---|
| `http://localhost:5173/mapa` | Arranca la demo |
| `http://localhost:3000/docs` | Swagger, por si preguntan por la API |
| El PR mergeado en GitHub | Evidencia de proceso |
| La última corrida verde del CI | Evidencia de testing |
| `docs/arquitectura/diagramas.md` | Los UML que pide el hito |

---

## Corriendo el guion contra Render (video del 23/09 y demo del 24/09)

Fran confirmó el 22/09 que Render ya tiene la versión sin códigos de caso de uso. A partir de acá
el video y la demo se ensayan contra el deploy, no contra `localhost`. Las pantallas del operador y
del ciudadano son las mismas, cambiando el host:

| Local | Render |
|---|---|
| `http://localhost:5173` | `https://citypass-residuos-frontend.onrender.com` |
| `http://localhost:3000/api/v1/health` | `https://citypass-residuos-api.onrender.com/api/v1/health` |
| `http://localhost:3000/docs` | `https://citypass-residuos-api.onrender.com/docs` |

Lo que cambia paso a paso, decidido en el grupo el 22/09:

### Paso 3 — el simulador (**listo**, probado contra Render el 22/09)

Rami no tenía las API keys de los 8 sensores del 08/09 (no hay endpoint para recuperarlas ni para
desvincular un sensor). Fran resembró producción: contenedores nuevos **CT-0010 a CT-0017** con sus
sensores, y dio de baja los 8 viejos (baja lógica, no se pierde el histórico) para que el mapa no
quede duplicado.

Probado de punta a punta contra Render: CT-0010 cruzó el umbral a 76% y generó la alerta, después
siguió reportando hasta 100% sin generar ninguna otra — la regla de "una sola vez, en la transición"
que se cuenta en este paso.

**Las API keys de los sensores nuevos están solo en la máquina de Fran**, que es la que se usa en la
demo. El simulador contra Render lo corre él: avisale cuando lleguen a este paso.

**CT-0010 quedó al 100%, en rojo, a propósito** — sirve para el primer ensayo del ciclo completo,
que termina vaciándolo.

**Lo que salió del ensayo del 23/09 contra Render:**

- **Los códigos del guion no existen en Render.** `CT-0001` está en una zona de prueba fuera del
  mapa y `CT-0007` está dado de baja. En Render se usan los contenedores de CT-0010 a CT-0017.
- **El comando tiene que llevar `API_URL`**; sin eso el simulador le pega a `localhost`:

  ```bash
  API_URL=https://citypass-residuos-api.onrender.com/api/v1 node simulador.js --escenario saturacion --contenedor CT-0013
  API_URL=https://citypass-residuos-api.onrender.com/api/v1 node simulador.js --escenario incendio --contenedor CT-0017
  ```

- **Saturación siempre con `--contenedor`, y sobre uno COMÚN.** El camión es común, y la ruta
  necesita dos o más comunes críticos para poder confirmar una parada y omitir la última.
- **`saturacion` sube a todos los sensores, no solo al elegido.** En 40 segundos quedaron cinco
  rojos. **Cortar con Ctrl+C apenas el elegido se pone rojo** (unos 15–20 s), o se pierde el "uno
  se pone rojo solo".
- **Incendio sobre el contenedor más verde del mapa.** Tarda unos 15 s en aparecer la alerta.
  Cortarlo apenas aparece.

### Paso 4 — el evento (cambia: se muestra en local)

A la base de Render no se puede entrar desde afuera (`ipAllowList` vacía y sin consola en el plan
gratis), y abrirla ahora es tocar infraestructura de producción por una demo. La tabla
`evento_pendiente` se muestra en **local**, en la misma laptop — tiene el mismo código y las mismas
migraciones que Render — y el `docker exec ... psql` de la sección "El guion" se corre ahí, no
contra el deploy. Como respaldo, tener a mano el test de integración de outbox.

### Paso 6 — el chofer de prueba (**listo**)

El chofer de prueba "Prueba Ensayo" (`ENSAYO-999`) se usó en el ensayo del 23/09 y **ya está dado
de baja**. En la demo el alta va en vivo: es el paso en sí.

**En Render no había ningún camión**: el resiembro del 22/09 no creó flota, y sin camión no se
puede generar la ruta. El 23/09 se dio de alta **AB123CD, 12.000 L, residuo común**. **No se
edita**: hasta que #47 llegue a Render, el formulario de camión manda la capacidad como texto si
se toca el campo, y el backend la rechaza con un confuso "must not be greater than 40000".
Para dar de alta otro camión, **no tocar el campo de capacidad** y dejar el 12000 que trae.

### Paso 5 — la predicción (cuidado con la tasa)

El simulador manda lecturas cada pocos segundos, así que la tarjeta muestra tasas de 700 a
1.200% por hora y "horas hasta el umbral" casi en cero. **No leer la tasa en voz alta**: contar la
idea (una recta sobre el ciclo actual) y señalar la confianza.

### Paso 7 — el chofer, ubicación (cambia: DevTools, no el simulador de GPS)

En Render el simulador de GPS está apagado. La ubicación se simula con **Chrome DevTools →
Cmd+Shift+P → "sensors" → Location → Other…**.

**Para confirmar una parada hay que estar en la ubicación de ESE contenedor**, no en el Obelisco.
El Obelisco (`-34.6037, -58.3816`) sirve solo para mostrar a propósito el `403` de "estás lejos".
Omitir una parada no pide ubicación.

| Contenedor | Latitud | Longitud |
|---|---|---|
| CT-0010 | `-34.596703` | `-58.385618` |
| CT-0013 | `-34.602193` | `-58.38425` |
| CT-0016 | `-34.598244` | `-58.377573` |

Revisar que en DevTools el **Network no quede en "3G"**: Chrome lo recuerda y hace que todo tarde.

**La frase "se cerró la alerta" solo vale si esa parada tenía una alerta abierta.** Si ese
contenedor ya tenía la alerta resuelta, el aviso dice solo "volvió a 0%".

### Antes de grabar o de entrar a la demo

La API en Render se duerme sola sin tráfico: un pedido en frío puede tardar más de 15 segundos y
quien esté grabando o presentando se queda mirando una pantalla en blanco. **Pegarle al health
unos minutos antes:**

```bash
curl https://citypass-residuos-api.onrender.com/api/v1/health
```

El frontend es estático y no se duerme, así que solo hace falta despertar la API. Lo hace quien
grabe el video, y lo mismo antes de la demo del 24/09.

Además, antes de grabar: **resolver en `/alertas` lo que haya quedado de los ensayos** y correr el
simulador con `--reiniciar` (lo corre Fran, desde su máquina) — los niveles se guardan entre
corridas y si no, el mapa arranca medio naranja.

### Sin resolver todavía

**Un `CT-0001` en Render, sin reclamar.** No aparece en la vista pública, probablemente marcado
fuera de servicio de cuando se probó el botón del #28. **Se deja así hasta después de la demo**: no
molesta (en el mapa del operador se ve gris), la baja de un contenedor no se puede deshacer desde la
API —no hay endpoint para reactivarlo— y hasta sirve como ejemplo si alguien pregunta por el estado
`FUERA_DE_SERVICIO`. También quedaron dos zonas de prueba (`Centro 178889...` y `zona test`) que
Fran va a intentar borrar; si no se dejan, no molestan para la demo.

### Plan B en Render

**Juana Pérez NO sirve de respaldo en Render tal cual está hoy.** El resiembro del 22/09 la creó,
pero con la sesión `dev-chofer` y sin credencial emitida. Para entrar como ella hace falta un token
de rol CHOFER firmado con el `JWT_SECRET` de producción, que **solo tiene Rami** — verificado en el
guard: acepta credencial (`token_use: chofer-interno`, emisor de choferes) o un token de rol CHOFER,
pero cualquiera de los dos tiene que estar firmado con el secreto de Render.

**El único plan B que funciona hoy es el "Chofer Respaldo" (RESP-001)** que armó Fran, con su
credencial ya guardada. No se toca en los ensayos.

Si Rami genera y pasa por privado un token de CHOFER firmado con el secreto de producción, Juana
pasa a ser un segundo plan B válido — hasta entonces, no usarla como respaldo.

---

## El guion

### 1 · El mapa (1 min) — CU-07

Abrís en `/mapa`. **No expliques la pantalla: mostrá lo que pasa solo.**

> "Esto es el estado de la ciudad ahora mismo. Cada marcador es un contenedor y el color es su
> nivel de llenado. No estoy actualizando nada: los sensores reportan cada pocos segundos y la
> pantalla se refresca sola."

Quedate callado y que se vea un marcador cambiar de color. **Ese silencio vale más que la
explicación.**

> **Puede tardar hasta 30 segundos**, que es el intervalo del polling. Contalo antes de callarte
> —"la pantalla se refresca sola cada 30 segundos"— para que la espera se lea como la regla
> funcionando y no como que se colgó.

Si preguntan cómo se actualiza: polling cada 30 segundos, decisión documentada, WebSocket evaluado
y pospuesto.

### 2 · De dónde salen los datos (1,5 min) — CU-01, CU-02, CU-04

Click en un contenedor. Se abre el panel con su detalle.

> "Cada contenedor tiene un sensor vinculado que autentica con su propia clave, distinta del login
> de las personas. El sensor no es un usuario."

Pasás por `/zonas` **sin detenerte mucho**:

> "El umbral que decide cuándo un contenedor está crítico no está en el código: se configura por
> zona. En el centro conviene 70%, en un barrio de baja densidad 85%."

Esto es lo que hace que el próximo paso no parezca magia.

### 3 · La detección automática (2 min) — CU-05, CU-06 · **el momento fuerte**

> **Los dos escenarios tienen que caer sobre contenedores DISTINTOS.** Si no, el que acabás de
> saturar es el mismo que después se prende fuego, y el remate —un contenedor **verde** con alerta
> de incendio— es imposible: no puede estar verde si lo saturaste hace treinta segundos. Por eso el
> segundo comando lleva `--contenedor`.

En otra terminal, y **narrándolo mientras pasa**:

```bash
cd simulator && npm run saturacion
```

> "Voy a simular que un contenedor se llena. Nadie va a apretar nada más."

Volvés al mapa. El marcador de **CT-0001** se pone rojo solo. Vas a `/alertas` y la alerta ya está
ahí. Cortá el simulador con Ctrl+C.

Ahora el que más impresiona, **sobre otro contenedor**:

```bash
cd simulator && node simulador.js --escenario incendio --contenedor CT-0007
```

> "Este otro contenedor está por debajo del umbral, o sea verde. Pero el sensor reporta 78 grados."

**Leé el porcentaje de la pantalla, no lo digas de memoria.** Depende de cuánto haya corrido el
simulador antes, y decir un número que no coincide con el que se ve arriba es peor que no decirlo.

Aparece la alerta crítica de incendio **sobre un contenedor verde**, con su halo naranja latiendo,
mientras CT-0001 sigue rojo al lado. Las dos reglas conviviendo en la misma pantalla es la mejor
prueba de que son independientes.

> "El incendio no depende del llenado. Un contenedor que no está ni cerca de llenarse puede estar
> prendido fuego, y ese es justo el caso que no se puede pasar por alto. Por eso son dos reglas
> distintas y el incendio se pinta aparte del color de estado."

**Este es el punto más alto de la demo.** Es una regla de negocio real, no un CRUD, y se ve.

### 4 · El evento (1 min) — dimensión 5 de la rúbrica, 10 puntos

No lo saltees aunque el hito diga "sin integración" — **justamente por eso**.

> "Cuando se detecta el incendio no solo se crea la alerta: se publica un evento
> `residuos.incendio.detectado`, que es lo que va a consumir el módulo de Emergencias. Todavía no
> hay bus, así que el evento se guarda en una tabla dentro de la misma transacción que la alerta."

Mostrás la tabla `evento_pendiente`:

```bash
docker exec -it citypass-residuos-db psql -U citypass -d residuos \
  -c "SELECT \"eventType\", estado, \"creadoEn\" FROM evento_pendiente ORDER BY \"creadoEn\" DESC LIMIT 5;"
```

> "Si el bus está caído, el evento no se pierde: queda acá y se reintenta. Y si la transacción
> falla, no queda ni la alerta ni el evento. Nunca se avisa de algo que no pasó."

Eso es el patrón outbox y es exactamente lo que pide la unidad de arquitectura orientada a eventos.

### 5 · La predicción (1 min) — CU-12, dimensión de IA/ML

En `/contenedores/:id`, la tarjeta de predicción.

> "Con el histórico de lecturas se ajusta una recta y se estima cuántas horas faltan para que cruce
> el umbral. Al lado del número va la confianza: si el R² es bajo, la tarjeta dice explícitamente
> que no se planifique con ese número."

**El detalle que conviene decir:** el ajuste usa solo el ciclo de llenado actual. Si la ventana
cruza un vaciado, la serie sube, cae a cero y vuelve a subir, y una recta sobre eso no describe
nada.

### 6 · La respuesta operativa (2,5 min) — CU-03, CU-08, CU-09

`/flota`, rápido:

> "Cada camión tiene capacidad y qué tipo de residuo puede levantar. No es decorativo: decide qué
> contenedores puede recolectar."

`/rutas` → generar ruta:

> "El sistema arma el recorrido: toma los contenedores críticos que este camión puede levantar,
> respeta su capacidad y ordena las paradas por cercanía."

**Señalá que el camión sigue disponible:**

> "La ruta nace como propuesta y el camión sigue libre. Es una propuesta, no un compromiso: recién
> se toma cuando una persona la confirma. Eso es a propósito, por si la propuesta es absurda."

**Antes de asignar, dás de alta al chofer que la va a ejecutar.** En `/choferes`, alta con nombre
y legajo, y **emitís su credencial**:

> "El chofer no se registra ni tiene login: es una persona de la operación, no un usuario de la
> plataforma. Se le emite una credencial desde acá, y se le muestra **una sola vez**, igual que la
> clave de un sensor."

El modal no deja cerrarse hasta confirmar que la guardaste. Copiala: la vas a pegar en el paso 7.

> **Dálo de alta en vivo, no uses a Juana Perez.** Emitir una credencial **rota** el identificador
> de sesión del chofer, así que si se la emitís a Juana, el token de `npm run token:dev -- CHOFER`
> que dejaste preparado deja de servir para ella — y ese token es tu plan B si algo falla en vivo.
> Con un chofer nuevo, Juana y su token quedan intactos de reserva.

Ahora sí, asignás la ruta a ese chofer. Ahí el camión pasa a `EN_RUTA`.

> "Y fíjense que el chofer se elige de una lista, no se escribe. Antes era un campo de texto que el
> backend no validaba: un identificador mal tipeado asignaba la ruta igual, con éxito, y el chofer
> no la veía nunca."

Es una frase que vale decir: muestra una decisión de diseño, no una pantalla.

### 7 · El chofer (2 min) — CU-10

Abrís `/chofer` **en otro navegador o en el celular** — no en la misma ventana donde venís
operando. Ahí pegás la credencial que copiaste en el paso 6.

> "Esta es la única pantalla que no es del operador. La ve el chofer, en la calle, desde el
> teléfono, y entra con la credencial que le emitieron. No hay login."

**Que sea otro navegador no es un detalle estético:** las dos sesiones conviven, y se ve que el
operador y el chofer son dos personas distintas mirando el mismo sistema al mismo tiempo. En una
sola ventana parece un cambio de pantalla.

Confirmás la primera parada:

> "Confirmó el vaciado. En una sola operación el contenedor volvió a verde, la alerta se cerró y
> se publicó el evento."

Volvés al mapa: el contenedor está verde y la alerta ya no está.

Y ahora **la parada que no se pudo vaciar**:

> "El caso real que faltaba: el chofer llega y hay un auto tapando el contenedor. Marca la parada
> como omitida, con el motivo."

Apretás **"No pude vaciar"**, elegís un motivo del desplegable y confirmás.

> "Fíjense en la diferencia: el contenedor **sigue lleno y sigue en rojo**, y su alerta sigue
> abierta, porque el problema sigue ahí. Pero la ruta se cierra igual y el camión queda libre. Sin
> esto, una calle cortada dejaba el camión trabado para siempre."

> **Omití la ÚLTIMA parada abierta, no una del medio.** La ruta se cierra y el camión se libera
> solo cuando no queda ninguna parada pendiente. Si omitís una del medio la ruta sigue `EN_CURSO`
> —que es lo correcto— pero entonces no podés decir la frase del camión libre. Con una ruta de dos
> paradas: confirmás la primera, omitís la segunda.

El motivo también lo ve el operador en `/rutas/:id`, que es de donde sale la decisión de si vuelve
a rutear ese contenedor hoy. Vale mostrarlo si sobra tiempo."

### 8 · La vista ciudadana (30 seg) — CU-11

`/cerca`, en el celular, **sin login**:

> "Un vecino que quiere tirar algo reciclable no tiene por qué tener usuario. Esta pantalla es
> pública y le muestra los contenedores más cercanos, con la distancia calculada por la base de
> datos."

Cierra bien: la demo termina mostrando que el módulo también sirve al ciudadano, no solo al
municipio.

### 9 · Cierre — evidencia (1 min)

Sin volver al código:

- **El CI en verde**: lint, build, y los tests de los dos lados. Backend: **393 unitarios y 82 de
  integración** contra PostgreSQL real, **90% de cobertura**. Frontend: **305 tests, 90,04% de
  líneas**. El mínimo exigido es 60% y se fuerza en el CI: si baja, el build falla.
- **El despliegue cloud**: Render Blueprint, `render.yaml`, API, frontend, PostgreSQL y job
  `Deploy — Render`, que dispara los deploy hooks cuando el CI de `main` termina en verde. La evidencia viva esta en
  [`docs/devops/evidencia-despliegue.md`](../devops/evidencia-despliegue.md).

> Los números cambian con cada PR. **Recontalos el día anterior** con `npm test` y `npm run
> test:e2e` en `backend/`, y `npm test` en `frontend/`. Decir un número viejo en voz alta es peor
> que no decir ninguno.
- **Los diagramas**: casos de uso, C4 nivel 1 y 2, arquitectura de eventos, dos de secuencia y
  cuatro máquinas de estado.
- **Las decisiones**: 8 ADRs, incluido el que documenta qué se recortó de cada caso de uso y por
  qué. Los recortes están decididos, no olvidados.

> "El ciclo completo que acaban de ver está escrito como test de integración. Si eso pasa, el
> módulo hace lo que dice que hace."

---

## Trampas que arruinan la demo

Todas estas se ven como "no anda" cuando en realidad el sistema está haciendo lo correcto.

| Trampa | Qué pasa | Cómo evitarla |
|---|---|---|
| **Emitirle la credencial a Juana Perez** | El token de `token:dev -- CHOFER` deja de servir, y te quedás sin plan B | Emitir una credencial **rota** el identificador de sesión. Dar de alta un chofer nuevo en vivo y emitirle a ese |
| **Un chofer sin credencial emitida** | Se le asigna la ruta bien, pero él no ve nada | Un chofer puede existir sin acceso configurado. La pantalla de asignación avisa antes de confirmar; si igual pasa, emitirle la credencial |
| **El botón "Copiar" de la credencial falla callado** | Creés que la copiaste, cerrás el modal —que no se puede reabrir— y la credencial se perdió | Si el navegador no da permiso de portapapeles, no copia y antes no avisaba. La regla es simple: **si el botón no pasa a "✓ Copiada", no se copió.** Leerla y anotarla antes de cerrar |
| **Cerrar la pestaña del celular** | El chofer pierde la credencial y no hay forma de recuperarla | Vive en `sessionStorage`: **aguanta un refresh pero muere con la pestaña**, y no se puede volver a consultar. Si pasa en vivo, emitirle otra desde `/choferes` — y tener presente que eso mata la anterior. Dejar la pestaña abierta desde el paso 6 |
| **Correr `saturacion` dos veces** | La segunda vez no aparece ninguna alerta nueva | Es correcto: la alerta se emite solo en la transición. Usar otro contenedor, o explicarlo como una virtud |
| **Saturación e incendio sobre el mismo contenedor** | El remate se cae: no podés mostrar un contenedor verde prendido fuego si lo acabás de saturar | Los escenarios pegan sobre el primer contenedor salvo que les digas otro. Usar `--contenedor CT-0007` en el de incendio |
| **El halo naranja de un ensayo queda pegado** | Aparecen contenedores con halo que no están incendiados, y el incendio "de verdad" pierde efecto porque ya había tres | El halo sale de tener una alerta de INCENDIO **ABIERTA**, no de la temperatura actual: que el sensor se enfríe no la cierra. **Resolver a mano en `/alertas` todas las alertas de los ensayos**, o resembrar |
| **Bajar el umbral de una zona en vivo** | El mapa no se repinta al instante | Cada contenedor se reevalúa con su próxima lectura. Esperar unos segundos, o no tocarlo en vivo |
| **Predicción sin datos** | Dice `SIN_LECTURAS_SUFICIENTES` | Necesita 3 lecturas del ciclo actual. Dejar el simulador corriendo antes, y no vaciar ese contenedor justo antes de mostrarlo |
| **Confirmar desde lejos** | `403`, "estás a N metros" | Es una regla, no un error. Si lo mostrás, mostralo a propósito |
| **Tokens vencidos** | Todo devuelve `401` | Duran 8 horas. Regenerarlos el mismo día |
| **Cambiar de rama invalida los tokens** | `401` aunque al token le queden horas | No es vencimiento: el contrato de identidad del Squad 2 cambió la validación, el backend en watch recompila, y un token firmado con el código anterior deja de servir. Regenerar los dos |
| **Pegar tokens con el front prendido** | Sigue el `401` aunque `.env.local` esté bien | **Vite lee `.env.local` solo al arrancar.** Reiniciar `npm run dev` |
| **Base vieja sin migrar** | El backend no arranca, o falta una columna nueva | `npm run migration:run` antes de todo, y de nuevo cada vez que traigas `develop` |

---

## Plan B

**Si el simulador no arranca:** las alertas del seed ya están en la base. Se puede contar la
historia igual, partiendo de una alerta existente.

**Si el frontend no levanta:** Swagger en `/docs` permite recorrer el mismo ciclo. Es menos
vistoso, pero se ve el contrato completo y las respuestas reales.

**Si se cae todo:** el test de integración `ciclo-de-recoleccion.e2e-spec.ts` recorre exactamente
esta historia contra PostgreSQL. Correrlo en vivo es una demo válida:

```bash
cd backend && npm run test:e2e
```

**Tener grabado un video de 3 minutos del recorrido**, hecho el día anterior. Es el seguro real.

---

## Quién muestra qué

| Parte | Quién |
|---|---|
| Mapa, alertas, rutas, chofer, ciudadano | Máximo — son sus pantallas |
| Simulador, evento en la tabla, reglas de negocio | Francisco — es el backend |
| CI, imagen Docker, despliegue | Ramiro |
| Identidad, roles, contrato con el Squad 2 | Adriel |
| Apertura y cierre, alcance y recortes | Nicolás |

**Una sola persona maneja la compartida de pantalla.** Cambiar de pantalla compartida en vivo es
la forma más rápida de perder dos minutos.

**La excepción es el paso 7.** El chofer entra desde otro navegador o desde un celular, y ahí sí
conviene que sea otra persona: se ve que el operador y el chofer son dos actores distintos usando
el sistema a la vez. Coordinen antes quién tiene la credencial.

---

## Documentos relacionados

- [Backlog priorizado](backlog-priorizado.md) — el alcance y los recortes
- [Diagramas](../arquitectura/diagramas.md) — los UML que pide el hito
- [Guía de integración](../arquitectura/guia-frontend.md) — el contrato de la API
- [ADR-004](../adr/ADR-004-alcance-y-recortes.md) — qué se recortó de cada caso de uso y por qué
