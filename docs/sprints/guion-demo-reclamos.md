# Guion de la demo — Reclamo por un auto que bloquea la bicisenda (CU-INT-02)

> **Caso de uso integrador:** *"Reclamo ciudadano que desencadena una intervención urbana"*.
> **Duración objetivo:** 6 minutos. Se ensaya entero al menos una vez el día anterior.

---

## La historia

> Un vecino denuncia un auto estacionado sobre la bicisenda → Reclamos lo publica →
> Residuos se da cuenta de que ese auto tapa un contenedor que el camión iba a vaciar →
> lo saca de la ruta y reordena el recorrido en marcha → le informa a BI →
> cuando Reclamos avisa que se retiró el auto, el contenedor vuelve a entrar.

Lo que tiene que quedar claro: **nadie toca la pantalla del operador ni del chofer.** La ruta cambia
sola, por un evento que llega de otro módulo.

**No dependemos de que Reclamos esté publicando:** `simulator/reclamo.js` manda al webhook los
mismos eventos que mandaría el gateway del Grupo 1, con el formato del contrato de Reclamos del
22/10 (`ReclamoCreado` con categoría `TRANSITO`, y `ReclamoActualizado` con `estadoNuevo: RESUELTO`).

---

## Antes de empezar (15 minutos antes)

1. **`GATEWAY_WEBHOOK_TOKEN` en el `.env` del backend.** Sin esa variable el webhook rechaza todo.

   ```bash
   echo GATEWAY_WEBHOOK_TOKEN=webhook-local >> ../backend/.env
   ```

2. **Backend y frontend corriendo**, con `EVENT_BUS_DRIVER=inmemory`: los eventos que publicamos
   aparecen en la consola del backend, que es lo que vamos a mostrar.

3. **Token de administrador** para los scripts:

   ```bash
   cd ../backend && npm run token:dev -- ADMINISTRADOR
   ```

4. **Datos:** desde `simulator/`, con la base vacía, sembrar el escenario y saturar **dos
   contenedores del mismo tipo**. El seed reparte los tipos en orden (COMÚN, RECICLABLE, ORGÁNICO),
   así que CT-0001 y CT-0004 son COMÚN. Cortar cada uno con Ctrl+C cuando aparezca `CRITICO`.

   ```bash
   TOKEN=<token> npm run seed
   node simulador.js --escenario saturacion --contenedor CT-0001 --intervalo 2
   node simulador.js --escenario saturacion --contenedor CT-0004 --intervalo 2
   ```

5. **Una ruta asignada:** en el front, dar de alta **dos camiones COMÚN** y un chofer. Con el
   primero, generar la ruta y asignarla. Tiene que tener **las dos paradas**: si tuviera una sola,
   al omitirla la ruta se cierra y el reordenamiento no se ve. El segundo camión queda libre para el
   paso 5 del guion.

6. **Variables para el script**, en la terminal de `simulator/`:

   ```bash
   export TOKEN=<token>
   export WEBHOOK_TOKEN=webhook-local
   ```

**En pantalla:** el front con el detalle de la ruta abierto a la izquierda, y a la derecha una
terminal en `simulator/` arriba y la consola del backend abajo.

---

## El guion

### 1 · El punto de partida (30 s)

**Mostrar:** el detalle de la ruta: dos paradas pendientes, en orden, y la distancia estimada.

**Decir:** "El camión ya salió con esta ruta. En el medio, un vecino ve un auto arriba de la
bicisenda y lo denuncia en la app de Reclamos."

### 2 · Llega el reclamo (1 min 30 s)

```bash
npm run reclamo
```

**Mostrar:** la salida del script, con la ruta antes y después. La parada del contenedor tapado
pasa a `OMITIDA`, con el motivo "Acceso bloqueado por vehiculo (reclamo …)", y la otra queda
pendiente y renumerada. Refrescar el detalle de la ruta en el front.

**Decir:**
- "Reclamos publicó `ReclamoCreado` en el gateway y nos llegó por el webhook. Residuos decidió solo
  si el auto le impide al camión llegar a algún contenedor: busca contenedores a 15 metros o menos."
- "Como tapa uno, lo saca de la ruta en marcha y reordena lo que queda desde donde está el
  camión. **Nadie tocó la pantalla.**"
- "El contenedor sigue lleno y con su alerta abierta: nadie lo vació, solo no se puede llegar."

### 3 · La decisión sale al bus, y de ahí a BI (1 min)

**Mostrar:** en la consola del backend, la línea `[residuos.reclamo.evaluado]`. Aparece en menos de
5 segundos, que es lo que tarda el despachador del outbox.

**Decir:**
- "Esa decisión se publica como `ReclamoEvaluado`: si el auto afecta la recolección, qué
  contenedores y qué rutas."
- "Es nuestra métrica para BI: el **porcentaje de reclamos que bloquean un contenedor**. BI cuenta
  los `reclamoId` distintos con `afectaRecoleccion` en true sobre el total evaluado."

### 4 · Un auto que no molesta (45 s)

```bash
npm run reclamo -- --lejos
```

**Mostrar:** la ruta no cambia, y en la consola sale otro `ReclamoEvaluado` con
`afectaRecoleccion: false`.

**Decir:** "Un auto mal estacionado a 100 metros no le cambia nada al camión. Igual informamos la
decisión: sin los 'no', BI no tiene contra qué calcular el porcentaje."

### 5 · Reclamos avisa que se retiró el auto (1 min 30 s)

**Mostrar primero:** generar una ruta con el **segundo camión**. Devuelve
`RUTA_SIN_CONTENEDORES`: el otro crítico sigue pendiente en la ruta del primer camión, y el tapado
está bloqueado aunque esté crítico.

```bash
npm run reclamo:resuelto
```

**Mostrar después:** generar de nuevo con el segundo camión. Ahora **la ruta incluye el contenedor**
que estaba tapado, aunque la ruta original siga en curso.

**Decir:**
- "El reclamo no lo resolvemos nosotros: lo cierra Reclamos cuando el área que corresponde retira
  el auto, y nos llega `ReclamoActualizado` con estado `RESUELTO`."
- "No hace falta esperar a que termine la ruta original: la parada omitida ya no la va a hacer
  nadie, así que otro camión puede levantarlo."
- "Si ese aviso no llega nunca, el bloqueo vence solo a las 4 horas: un contenedor no puede quedar
  afuera del ruteo para siempre porque se perdió un mensaje."

---

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `webhook … -> 401` | Falta o no coincide `GATEWAY_WEBHOOK_TOKEN` | Revisar el paso 1 y reiniciar el backend |
| "No hay ninguna ruta EN_CURSO ni ASIGNADA" | No se asignó la ruta | Asignarla desde el front, o pasar `--ruta <id>` |
| La ruta queda `COMPLETADA` después del reclamo | Tenía una sola parada | Volver al paso 4 de la preparación con dos contenedores |
| No aparece `[residuos.reclamo.evaluado]` | El despachador corre cada 5 s | Esperar unos segundos; está en el outbox |
| Generar con el segundo camión da `CAMION_NO_DISPONIBLE` | Se usó el primer camión, que está en ruta | Elegir el segundo camión |
| La parada omitida no es la que se esperaba | El script toma la próxima pendiente | Es correcto: es la que el camión tenía que visitar primero |

---

## Preguntas probables

- **"¿Y si es una bicicleta y no un auto?"** Reclamos manda la categoría `TRANSITO`, y nosotros
  además pedimos que el título o la descripción hablen de un vehículo. Un problema de tránsito que
  no es un vehículo, como un semáforo roto, se ignora.
- **"¿Por qué 15 metros?"** Es el largo de un auto más el espacio que necesita el camión para
  maniobrar frente al contenedor. Es configurable (`OBSTRUCCION_RADIO_METROS`).
- **"¿Qué pasa si el mismo reclamo llega dos veces?"** El webhook no procesa dos veces el mismo
  evento, y la obstrucción tiene una clave única por reclamo y contenedor. BI cuenta por
  `reclamoId`, así que tampoco duplica la métrica.
- **"¿Y si Reclamos manda un evento mal formado?"** Se ignora y se loguea, no se rechaza: un 400
  haría que el bus lo reintente para siempre.
- **"¿Por qué no se reabre la parada omitida cuando se retira el auto?"** Porque la ruta pudo haber
  terminado y el camión ya estar libre. El contenedor vuelve a entrar en la próxima ruta que se
  genere.
