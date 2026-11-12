# Guion de la demo — Reclamo por un auto que bloquea la bicisenda (CU-INT-02)

> **Caso de uso integrador:** *"Reclamo ciudadano que desencadena una intervención urbana"*.
> **Dónde:** en Render, igual que la prueba del 12/11 (ver `integracion-reclamos-backend.md`).
> **Duración objetivo:** 6 minutos. Se ensaya entero al menos una vez el día anterior.

---

## Resumen para la exposición

**El caso en una frase:** un vecino denuncia un auto sobre la bicisenda y, si ese auto tapa un
contenedor, Residuos lo saca solo de la ruta del camión que está en marcha.

| Decisión | Por qué |
|---|---|
| Residuos **reacciona** a `ReclamoCreado`, Reclamos no le da órdenes | Cada módulo decide qué hacer con un hecho: no hay acople entre ellos |
| Radio de **15 m** | El largo de un auto más el espacio para que el camión maniobre frente al contenedor. Configurable |
| La parada queda **`OMITIDA`**, no se borra | Queda a la vista el motivo, con el id del reclamo, y la ruta conserva lo que pasó |
| Las pendientes **se reordenan** desde el último contenedor confirmado | El camión ya está en la calle: no vuelve al depósito para replanificar |
| El bloqueo **vence a las 4 h** | Si se pierde el aviso de Reclamos, el contenedor no queda afuera del ruteo para siempre |
| Se publica **`ReclamoEvaluado` siempre**, afecte o no | Sin los "no", no hay contra qué calcular el porcentaje |
| La métrica la definimos **nosotros** | Nos lo confirmó el profe: la muestra cada módulo y le tiene que servir |

**Métrica:** porcentaje de reclamos que bloquean un contenedor = `reclamoId` distintos con
`afectaRecoleccion = true` sobre `reclamoId` distintos evaluados. La calcula Analítica con
`ReclamoEvaluado` y se ve en **Métricas** cuando su dashboard esté conectado.

---

## La historia

> Un vecino denuncia un auto estacionado sobre la bicisenda → Reclamos lo publica →
> Residuos se da cuenta de que ese auto tapa un contenedor que el camión iba a vaciar →
> lo saca de la ruta y reordena el recorrido en marcha → publica la decisión en el bus →
> cuando Reclamos avisa que se retiró el auto, el contenedor vuelve a entrar.

Lo que tiene que quedar claro: **nadie toca la pantalla del operador ni del chofer.** La ruta cambia
sola, por un evento que llega de otro módulo.

**No dependemos de que Reclamos esté publicando:** `simulator/reclamo.js` manda al webhook de
Render el mismo `ReclamoCreado` del contrato de Reclamos (categoría `TRANSITO`), y después el
`ReclamoActualizado` con `estadoNuevo: RESUELTO`. Si Reclamos ya publica de verdad, se puede pedir
que carguen el reclamo en vivo con las coordenadas del contenedor.

---

## Antes de empezar

### El día anterior

- [ ] Pedirle a Ramiro el `GATEWAY_WEBHOOK_TOKEN` vigente de Render: si lo cambió, el viejo da 401.
- [ ] Los datos de la demo, ya creados en Render: la zona **Demo Fran** con los contenedores
      **FRAN-01**, **FRAN-02** y **FRAN-03** (Común, críticos al 95 %), el camión **FR123AN**
      (Común, 10.000 L) y el chofer **Fran Isola** (`FRAN-001`). El segundo camión del paso 5
      puede ser cualquier otro Común disponible.
- [ ] Que los tres FRAN sigan críticos y sin ruta: si se usaron en un ensayo, mandarles otra
      lectura al 95 % con la clave de su sensor (`POST /lecturas` con el header `X-Sensor-Key`).
- [ ] Ensayar el guion entero.

### Diez minutos antes

1. **Despertar la API**, que en el plan gratis se duerme: repetir hasta que diga `"status":"ok"`.

   ```bash
   curl -s https://citypass-residuos-api.onrender.com/api/v1/health
   ```

2. **Armar la ruta:** en **Rutas**, generar con el camión **FR123AN** y la zona **Demo Fran**, y
   asignarla a **Fran Isola**. Sale con FRAN-01, FRAN-02 y FRAN-03, unos 1,5 km. Copiar su id de la
   URL (`/rutas/<id>`). Si ya hay una asignada sin usar, sirve esa.

   Si dice `RUTA_SIN_CONTENEDORES`, los FRAN no están críticos o ya están en otra ruta.

3. **Cargar las variables** en una terminal de Git Bash, en `simulator/`:

   ```bash
   export API_URL='https://citypass-residuos-api.onrender.com/api/v1'
   export TOKEN='<lo que va después de "Bearer " en F12, Red, cualquier pedido a la API>'
   export WEBHOOK_TOKEN='<el de Ramiro>'
   ```

   `TOKEN` es tu sesión: lee la ruta para mostrar el antes y el después, y vence en unas horas.
   `WEBHOOK_TOKEN` es el secreto del webhook: con él se mandan los eventos.

**En pantalla:** el detalle de la ruta a la izquierda y la terminal a la derecha.

---

## El guion

### 1 · El punto de partida (30 s)

**Mostrar:** el detalle de la ruta: las paradas pendientes, en orden, y la distancia estimada.

**Decir:** "El camión ya salió con esta ruta. En el medio, un vecino ve un auto arriba de la
bicisenda y lo denuncia en la app de Reclamos."

### 2 · Llega el reclamo (1 min 30 s)

```bash
npm run reclamo -- --ruta <id>
```

**Mostrar:** la salida del script, con la ruta antes y después. La parada del contenedor tapado
pasa a `OMITIDA`, con el motivo "Acceso bloqueado por vehiculo (reclamo …)", y bajan los km.
Recargar el detalle de la ruta en el front con F5.

**Decir:**
- "Reclamos publicó `ReclamoCreado` y nos llegó. Residuos decidió solo si el auto le impide al
  camión llegar a algún contenedor: busca contenedores a 15 metros o menos."
- "Como tapa uno, lo saca de la ruta en marcha y reordena lo que queda desde donde está el
  camión. **Nadie tocó la pantalla.**"
- "El contenedor sigue lleno y con su alerta abierta: nadie lo vació, solo no se puede llegar."

### 3 · La decisión sale al bus (1 min)

**Mostrar:** si alguien tiene abiertos los logs de la API en Render, la línea
`[residuos.reclamo.evaluado]`. Si no, contarlo con lo que se comprobó el 12/11.

**Decir:**
- "Esa decisión se publica en el bus como `ReclamoEvaluado`: si el auto afecta la recolección,
  qué contenedores tapa y qué rutas se recalcularon. En la prueba del 12/11 la encontramos en EDA."
- "Es la base de nuestra métrica: el **porcentaje de reclamos que bloquean un contenedor**."

### 4 · Un auto que no molesta (45 s)

```bash
npm run reclamo -- --lejos --ruta <id>
```

**Mostrar:** la ruta no cambia: las mismas paradas y los mismos km.

**Decir:** "Un auto mal estacionado a 100 metros no le cambia nada al camión. Igual publicamos la
decisión, con `afectaRecoleccion` en false: sin los 'no', no hay contra qué calcular el porcentaje."

### 5 · Reclamos avisa que se retiró el auto (1 min 30 s)

```bash
npm run reclamo:resuelto
```

**Mostrar:** generar una ruta con el **segundo camión**. **La ruta incluye el contenedor** que
estaba tapado, aunque la ruta original siga en curso: mientras duraba el bloqueo no entraba en
ninguna.

**Decir:**
- "El reclamo no lo resolvemos nosotros: lo cierra Reclamos cuando el área que corresponde retira
  el auto, y nos llega `ReclamoActualizado` con estado `RESUELTO`."
- "No hace falta esperar a que termine la ruta original: la parada omitida ya no la va a hacer
  nadie, así que otro camión puede levantarlo."
- "Si ese aviso no llega nunca, el bloqueo vence solo a las 4 horas."

**Al terminar:** `unset TOKEN WEBHOOK_TOKEN`.

---

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `webhook … -> 401` | `WEBHOOK_TOKEN` no coincide con el de Render | Pedirle el vigente a Ramiro |
| `GET … -> 401` | Venció `TOKEN` | Copiarlo de nuevo del navegador |
| El script tarda o da error de conexión | La API estaba dormida | Repetir el `curl` del health y volver a correrlo |
| `RUTA_SIN_CONTENEDORES` al generar | No hay críticos libres de ese tipo, o la zona no tiene | Generar sin zona o con otro camión |
| "La ruta no tiene paradas pendientes" | La ruta ya se usó en un ensayo | Armar una ruta nueva |
| La ruta queda `COMPLETADA` después del reclamo | Tenía una sola parada | Armar una con dos o más |
| La parada omitida no es la que se esperaba | El script toma la próxima pendiente | Es correcto: es la que el camión tenía que visitar primero |

**Plan B, sin Render:** el mismo guion en local, con el backend en `EVENT_BUS_DRIVER=inmemory` y
`GATEWAY_WEBHOOK_TOKEN=webhook-local` en el `.env`; `TOKEN` sale de
`cd ../backend && npm run token:dev -- ADMINISTRADOR` y los datos de `TOKEN=<token> npm run seed`.
En vez de los logs de Render, la línea `[residuos.reclamo.evaluado]` aparece en la consola del
backend.

---

## Preguntas probables

- **"¿Y si es una bicicleta y no un auto?"** Reclamos manda la categoría `TRANSITO`, y nosotros
  además pedimos que el título o la descripción hablen de un vehículo. Un problema de tránsito que
  no es un vehículo, como un semáforo roto, se ignora.
- **"¿Por qué 15 metros?"** Es el largo de un auto más el espacio que necesita el camión para
  maniobrar frente al contenedor. Es configurable (`OBSTRUCCION_RADIO_METROS`).
- **"¿Qué pasa si el mismo reclamo llega dos veces?"** No se procesa dos veces el mismo evento, y
  la obstrucción tiene una clave única por reclamo y contenedor. La métrica cuenta por `reclamoId`,
  así que tampoco se duplica.
- **"¿Y si Reclamos manda un evento mal formado?"** Se ignora y se loguea, no se rechaza: un 400
  haría que el bus lo reintente para siempre.
- **"¿Por qué no se reabre la parada omitida cuando se retira el auto?"** Porque la ruta pudo haber
  terminado y el camión ya estar libre. El contenedor vuelve a entrar en la próxima ruta que se
  genere.
- **"¿Por qué la métrica es esa y no cuadrillas enviadas?"** Porque en este caso no sale ninguna
  cuadrilla: el reclamo hace que el camión saltee una parada. Lo que nos sirve medir es cuántos
  reclamos nos afectan de verdad.
