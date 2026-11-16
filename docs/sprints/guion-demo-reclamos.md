# Guion de la demo — Reclamo por un auto que bloquea la bicisenda (CU-INT-02)

> **Caso de uso integrador:** *"Reclamo ciudadano que desencadena una intervención urbana"*.
> **Cuándo:** jueves 19/11, en la **presentación conjunta del caso**: Reclamos (agus) crea el reclamo
> en vivo y cada grupo muestra cómo reacciona su módulo. **Dónde:** en Render.
> **Duración del bloque de Residuos:** 10 minutos. Se ensaya entero al menos una vez el día anterior.

---

## Resumen para la exposición

**El caso en una frase:** un vecino denuncia un auto sobre la bicisenda y, si ese auto tapa un
contenedor, Residuos lo saca solo de la ruta del camión que está en marcha.

| Decisión | Por qué |
|---|---|
| Residuos **reacciona** a `ReclamoCreado`, Reclamos no le da órdenes | Cada módulo decide qué hacer con un hecho: no hay acople entre ellos |
| Radio de **15 m** | El largo de un auto más el espacio para que el camión maniobre frente al contenedor. Configurable |
| Solo cuenta **un vehículo**: `TRANSITO` con el auto en el texto, o sobre la `CICLOVIA` | Un pozo en la bicisenda le importa a Movilidad, no al camión |
| La parada queda **`OMITIDA`**, no se borra | Queda a la vista el motivo, con el id del reclamo, y la ruta conserva lo que pasó |
| Las pendientes **se reordenan** desde el último contenedor confirmado | El camión ya está en la calle: no vuelve al depósito para replanificar |
| Se abre una alerta **"Acceso bloqueado"** y se cierra sola al liberarse | El operador se entera sin mirar la ruta, y no le queda una alerta vieja abierta |
| El bloqueo **vence a las 4 h** | Si se pierde el aviso de Reclamos, el contenedor no queda afuera del ruteo para siempre |
| Se publica **`ReclamoEvaluado` siempre**, afecte o no | Sin los "no", no hay contra qué calcular el porcentaje |
| La parada que se cae sale **`CANCELADA`** para Analítica | `IntervencionActualizada` con `causaTipo: INCIDENTE_VIAL` y `causaId` = el reclamo |
| La métrica la definimos **nosotros** | Nos lo confirmó el profe: la muestra cada módulo y le tiene que servir |

**Métrica:** porcentaje de reclamos que bloquean un contenedor = `reclamoId` distintos con
`afectaRecoleccion = true` sobre `reclamoId` distintos evaluados. La calcula Analítica con
`ReclamoEvaluado`.

---

## Cómo encaja Residuos en la presentación del grupo

1. **agus crea el reclamo** en la app de Reclamos, en el punto acordado, y muestra lo suyo.
2. **Bloque de Residuos (10 min):** el escenario A con ese reclamo, más los escenarios B y C, y la
   métrica.
3. Siguen los demás grupos con el mismo reclamo.
4. **agus lo pasa a `RESUELTO`** y Residuos cierra con el escenario D (2 min). Si el orden del grupo
   lo permite, agus lo resuelve dentro del bloque de Residuos y queda todo junto.

Hay que acordar el orden con el grupo antes del jueves.

### El punto del reclamo

Tiene que haber un contenedor de Residuos a 15 m o menos, **pendiente en una ruta asignada**. Por
defecto, **FRAN-02: -34.599, -58.382**. Si el grupo elige otro punto (por ejemplo, uno que le sirva
a Movilidad), se crea un contenedor de demo ahí mismo en la zona **Demo Fran**, crítico, y entra en
la ruta.

Lo que agus carga: categoría `TRANSITO`, objeto afectado `CICLOVIA`, `afectaCirculacion: true`, y
un título que nombre al auto ("Auto estacionado sobre la ciclovía").

---

## Antes de empezar

### El día anterior

- [ ] Acordar con el grupo el punto del reclamo y el orden de la presentación.
- [ ] Pedirle a Ramiro el `GATEWAY_WEBHOOK_TOKEN` vigente de Render, para el simulador de los
      escenarios B y C y para el plan B.
- [ ] Los datos de la demo en Render: la zona **Demo Fran** con **FRAN-01**, **FRAN-02** y
      **FRAN-03** (Común, críticos al 95 %), el camión **FR123AN** (Común, 10.000 L) y el chofer
      **Fran Isola** (`FRAN-001`). El segundo camión del escenario D puede ser cualquier otro Común
      disponible.
- [ ] Que los FRAN sigan críticos, sin ruta y **sin bloqueos de ensayos**: un reclamo de prueba sin
      resolver los deja afuera del ruteo hasta 4 h. Si hace falta, resolverlo con
      `npm run reclamo:resuelto -- <reclamoId>` y mandarles otra lectura al 95 % con la clave de su
      sensor (`POST /lecturas` con el header `X-Sensor-Key`).
- [ ] Que **Métricas** muestre el dashboard de Analítica. Con #106, la API lo pide a Analítica con
      la sesión del usuario: Ramiro carga `ANALITICA_URL` en la API de Render.
- [ ] Ensayar el bloque entero, con agus si se puede.

### Diez minutos antes

1. **Despertar la API y mantenerla despierta.** En el plan gratis se duerme a los 15 minutos sin
   uso, y dormida el reclamo de agus llega igual pero tarde: el del 15/11 se procesó más de dos horas
   después. Abrir el front con la sesión iniciada y **dejarlo abierto**: la campanita consulta la API
   cada 15 s.

   ```bash
   curl -s https://citypass-residuos-api.onrender.com/api/v1/health
   ```

2. **Armar la ruta:** si quedó una ruta de un ensayo, terminarla primero desde la vista del chofer
   (`/chofer`, con su credencial): **No pude vaciar** en cada parada pendiente, motivo "Ensayo de la
   demo". Omitidas, los FRAN siguen al 95 %; confirmadas como vaciadas, bajarían a 0 % y quedarían
   afuera. Después, **F5** en **Rutas** (si no, el camión recién liberado no aparece en la lista),
   generar con el camión **FR123AN** y la zona **Demo Fran**, y **asignarla** a **Fran Isola**.
   Tiene que quedar asignada: si queda como propuesta, la parada se borra en vez de cancelarse y no
   sale el `CANCELADA` para Analítica. El simulador encuentra solo la ruta activa de FR123AN.

   Si dice `RUTA_SIN_CONTENEDORES`, los FRAN no están críticos o ya están en otra ruta.

3. **Cargar las variables** en una terminal de Git Bash, en `simulator/`:

   ```bash
   export API_URL='https://citypass-residuos-api.onrender.com/api/v1'
   export WEBHOOK_TOKEN='<el de Ramiro>'
   read -p 'Usuario: ' LOGIN_USER && read -s -p 'Contraseña: ' LOGIN_PASSWORD && export LOGIN_USER LOGIN_PASSWORD
   ```

   Usuario y contraseña son los del front. Con eso el simulador inicia sesión solo en cada
   corrida: no hay token de F12 que venza a los 15 minutos. Más cómodo: las cuatro variables en
   `simulator/.env` (`API_URL=...` por línea, ignorado por git) y no hay que exportar nada.

**En pantalla:** el detalle de la ruta, la vista del chofer (otra ventana o el celular: se
actualiza sola cada 15 s), la lista de **Alertas** y la terminal. Si alguien del grupo tiene acceso,
la consola de EDA para mostrar los eventos.

---

## El bloque de Residuos (10 min)

### 1 · Qué hace Residuos en este caso (1 min)

**Mostrar:** el detalle de la ruta: las paradas pendientes, en orden, y los km.

**Decir:**
- "El camión ya salió con esta ruta. Nadie de Residuos va a tocar la pantalla: todo lo que pase
  ahora lo dispara el reclamo que acaba de crear agus."
- "Residuos tiene una sola pregunta para cada reclamo: **¿este auto le impide al camión llegar a
  algún contenedor?** Busca contenedores a 15 metros o menos del auto."

### 2 · Escenario A: el auto tapa un contenedor (3 min)

Es el reclamo que creó agus. Con la API despierta llega en segundos.

**Mostrar:**
1. Recargar el detalle de la ruta con F5: la parada del contenedor tapado pasa a **`OMITIDA`**, con
   el motivo "Acceso bloqueado por vehiculo (reclamo …)", y bajan los km.
2. **Alertas:** pulsar **Refrescar** (la lista no se actualiza sola). Hay una **"Acceso bloqueado"**
   nueva sobre el contenedor, con el id del reclamo en el detalle, y la campanita suma una. Se puede
   pulsar **Atender**, nunca **Resolver**: cerrarla a mano no libera el contenedor, y en el escenario
   D se pierde que se cierre sola.
3. Si hay EDA: el **`ReclamoEvaluado`** con `afectaRecoleccion: true`, y el
   **`IntervencionActualizada`** con `PROGRAMADA` → `CANCELADA`.

**Decir:**
- "El auto está a menos de 15 metros de este contenedor, así que el camión no va a poder vaciarlo.
  Residuos lo sacó de la ruta en marcha y reordenó lo que queda desde donde está el camión."
- "La parada no se borra: queda omitida, con el número de reclamo, para que se sepa por qué."
- "Al operador le salta una alerta de acceso bloqueado: se entera sin abrir la ruta."
- "El contenedor sigue lleno y con su alerta de saturación: nadie lo vació, solo no se puede llegar."
- "Y le contamos al resto: `ReclamoEvaluado` para Reclamos y nuestra métrica, y la parada cancelada
  para Analítica."

### 3 · Escenario B: el auto no tapa nada (1 min 30 s)

```bash
npm run reclamo -- --lejos
```

El simulador hace de Reclamos: el mismo `ReclamoCreado`, con el auto a ~100 m de la próxima parada
**pendiente** (si agus tapó FRAN-02, es FRAN-01).
Si agus prefiere crearlo él, el punto es el contenedor + 0,0009 de latitud (por ejemplo, para FRAN-02,
-34.5981, -58.382).

**Mostrar:** la salida del script: el contenedor más cerca está a 100 m, afuera de los 15, y la ruta
antes y después es la misma. En Alertas no aparece nada.

**Decir:** "Un auto mal estacionado a 100 metros molesta a los ciclistas, pero no al camión. La ruta no
cambia. Igual publicamos la decisión, con `afectaRecoleccion: false`: sin los 'no', no hay contra qué
calcular el porcentaje."

### 4 · Escenario C: no es un auto (1 min 30 s)

```bash
npm run reclamo -- --bache
```

Un pozo en la bicisenda (`BACHES` + `CICLOVIA`), a ~5 m de la próxima parada.

**Mostrar:** la salida del script: el contenedor está a 5 m, pero es un pozo. La ruta no cambia y no
hay alerta, aunque el reclamo está pegado al contenedor.

**Decir:**
- "Este reclamo está a 5 metros del contenedor, pero es un pozo, no un auto. Al camión no le impide
  vaciarlo, así que Residuos lo ignora."
- "Es el mismo objeto afectado, la ciclovía, que le importa a Movilidad. Cada módulo decide con su
  propia regla qué hacer con el mismo hecho."
- "Como no nos toca, no lo evaluamos: no cuenta para nuestra métrica."

### 5 · La métrica (1 min)

**Mostrar:** la pantalla **Métricas** de nuestro front, con el dashboard de Analítica embebido.

**Decir:**
- "En esta demo llegaron tres reclamos. Uno no era nuestro, el pozo. De los dos que evaluamos, uno
  bloqueó un contenedor: **1 de 2, el 50 %**."
- "Eso es lo que mide nuestra métrica: **qué porcentaje de los reclamos que evaluamos nos bloquea un
  contenedor**. La calcula Analítica con los `ReclamoEvaluado`. Si ese número sube, hay un problema
  de autos estacionados frente a contenedores que el municipio puede atacar."
- "Además, Analítica cuenta las paradas que se cancelaron por reclamos con el
  `IntervencionActualizada` que publicamos. Las dos cosas se ven acá, dentro de nuestra app."

El número acumulado del dashboard incluye los ensayos: no va a dar exactamente 50 %. Si el dashboard
no carga, la pantalla tiene un enlace para abrirlo en otra pestaña.

### 6 · Escenario D: se retira el auto (2 min)

agus pasa el reclamo a **`RESUELTO`** desde Reclamos.

**Mostrar:**
1. **Alertas:** pulsar **Refrescar**. La de acceso bloqueado pasó sola a **Resuelta** y la campanita
   resta una.
2. **Rutas:** generar una ruta con el **segundo camión**. **La ruta incluye el contenedor** que estaba
   tapado, aunque la ruta original siga en curso.

**Decir:**
- "El reclamo no lo resolvemos nosotros: lo cierra Reclamos cuando el área que corresponde retira el
  auto, y nos llega `ReclamoActualizado` con estado `RESUELTO`."
- "La alerta se cerró sola, y el contenedor volvió al ruteo: otro camión lo puede levantar sin
  esperar a que termine la ruta original."
- "Si ese aviso no llegara nunca, el bloqueo vence solo a las 4 horas."

**Al terminar:** `unset WEBHOOK_TOKEN LOGIN_USER LOGIN_PASSWORD`.

---

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El reclamo de agus no cambia la ruta | La API estaba dormida, o el punto no tiene un contenedor a 15 m pendiente en la ruta | Esperar unos segundos y F5. Si no llega, plan B: `npm run reclamo -- --contenedor FRAN-02` |
| La parada se omite pero no aparece la alerta | La lista de Alertas no se refrescó | Pulsar **Refrescar** |
| agus no puede resolverlo | Algo de su lado | `npm run reclamo:resuelto -- <reclamoId de agus>` |
| `webhook … -> 401` | `WEBHOOK_TOKEN` no coincide con el de Render | Pedirle el vigente a Ramiro |
| `Login -> 401` | Usuario o contraseña mal tipeados | Repetir la línea del `read` |
| `GET … -> 401` | Quedó exportado un `TOKEN` viejo, que gana sobre el login | `unset TOKEN` |
| El script tarda o da error de conexión | La API estaba dormida | Repetir el `curl` del health y volver a correrlo |
| Queda una "Acceso bloqueado" abierta de un ensayo | No se resolvió el reclamo que tapaba | `npm run reclamo:resuelto -- <id del detalle de la alerta>` |
| `RUTA_SIN_CONTENEDORES` al generar | No hay críticos libres de ese tipo, o están bloqueados por un ensayo | Resolver los reclamos de ensayo, o generar con otro camión |
| "La ruta no tiene paradas pendientes" | La ruta ya se usó en un ensayo | Armar una ruta nueva |
| La ruta queda `COMPLETADA` después del reclamo | Tenía una sola parada | Armar una con dos o más |

**Plan B, sin el bus:** el escenario A con el simulador, `npm run reclamo -- --contenedor FRAN-02`
(el mismo contenedor que tapa agus, así B y C no cambian), y el D con `npm run reclamo:resuelto`, que
libera el último reclamo que tapó un contenedor: `--lejos` y `--bache` no lo pisan.
Es el mismo `ReclamoCreado` del contrato de Reclamos, entrando por el webhook en vez de Kafka.

**Plan C, sin Render:** el mismo guion en local, con el backend en `EVENT_BUS_DRIVER=inmemory` y
`GATEWAY_WEBHOOK_TOKEN=webhook-local` en el `.env`. Cambiar el `.env` no toca las variables de la
terminal del simulador, que siguen apuntando a Render: antes del seed y de los eventos, en
`simulator/`,

```bash
export API_URL='http://localhost:3000/api/v1'
export WEBHOOK_TOKEN='webhook-local'
```

`TOKEN` sale de `cd ../backend && npm run token:dev -- ADMINISTRADOR` y los datos de
`TOKEN=<token> npm run seed`. En vez de EDA, los eventos aparecen en la consola del backend.

---

## Preguntas probables

- **"¿Y si dos vecinos denuncian el mismo auto?"** Llegan dos reclamos: la parada ya está omitida y la
  alerta no se duplica, porque hay una sola abierta por contenedor. Se cierra cuando se resuelve el
  último que lo tapaba.
- **"¿Y los estados intermedios del reclamo?"** Reclamos publica `ReclamoActualizado` también con
  `ASIGNADO` y `EN_PROCESO`. Los ignoramos: el auto sigue ahí hasta que el reclamo se resuelve o se
  cierra.
- **"¿Y si el mismo evento llega dos veces?"** No se procesa dos veces: se deduplica por `eventId`, y
  la obstrucción tiene una clave única por reclamo y contenedor. La métrica cuenta por `reclamoId`.
- **"¿Y si es una bicicleta o un semáforo roto?"** Con `TRANSITO` pedimos que el texto nombre un
  vehículo o que el objeto afectado sea la ciclovía. Un semáforo roto se ignora.
- **"¿Por qué 15 metros?"** El largo de un auto más el espacio que necesita el camión para maniobrar
  frente al contenedor. Es configurable (`OBSTRUCCION_RADIO_METROS`).
- **"¿Y si Reclamos manda un evento mal formado?"** Se ignora y se loguea, no se rechaza: rechazarlo
  haría que el bus lo reintente para siempre.
- **"¿Qué pasó cuando Reclamos cambió la versión del evento?"** El gateway lo pasó a un tópico nuevo,
  `ReclamoCreado.v3`. Escuchamos todos los tópicos de Reclamos y aceptamos el tipo con o sin la
  versión, así que no se perdió nada.
- **"¿Por qué no se reabre la parada omitida cuando se retira el auto?"** Porque la ruta pudo haber
  terminado y el camión ya estar libre. El contenedor vuelve a entrar en la próxima ruta que se genere.
- **"¿Por qué la métrica es esa y no cuadrillas enviadas?"** Porque en este caso no sale ninguna
  cuadrilla: el reclamo hace que el camión saltee una parada. Lo que nos sirve medir es cuántos
  reclamos nos afectan de verdad. A Analítica igual le mandamos la parada cancelada.
