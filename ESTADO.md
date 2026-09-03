# Módulo de Residuos — estado, casos de uso y pendientes

Squad 4 · Actualizado al **2026-09-03**

Qué hace cada caso de uso, dónde vive en el código, qué reglas no se pueden pasar por alto, y qué
falta. Es el único documento de estado del módulo.

Para el contrato de la API endpoint por endpoint, con capturas reales de cada respuesta, ver
[docs/arquitectura/guia-frontend.md](docs/arquitectura/guia-frontend.md).

---

## Resumen

- **Los 12 casos de uso están implementados de punta a punta**, backend y frontend, corriendo
  contra PostgreSQL. No queda ninguna pantalla con datos falsos.
- Lo que falta **no es código**: dos pull requests, una decisión de equipo y cuatro pedidos de
  contrato menores.
- El ciclo completo está verificado: contenedor satura → se genera la alerta → se arma la ruta →
  se asigna al chofer → el chofer confirma → el contenedor vuelve a verde, la alerta se cierra y
  el camión queda libre.

| | |
|---|---|
| Casos de uso | 12 de 12 implementados |
| Pantallas | 10 (8 del operador + 2 de otros actores) |
| Tests del frontend | 177, en verde |
| Cobertura del frontend | 81,79% de líneas · el umbral de la cátedra es 60% |
| CI | lint, build y tests de backend **y** frontend |

---

## Cómo levantar todo

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

```bash
cd backend && npm install && npm run migration:run && npm run start:dev
```

```bash
cd frontend && npm install && npm run dev
```

La API queda en `http://localhost:3000/api/v1` (Swagger en `/docs`) y la aplicación en
`http://localhost:5173`.

> **El esquema sale de migraciones, no de `synchronize`.** Si tenías una base creada antes de ese
> cambio, `npm run migration:run` falla porque las tablas ya existen sin estar registradas en la
> tabla `migrations`. Hay que vaciar el esquema y volver a migrar.

### Datos para la demo

```bash
cd backend && npm run token:dev -- ADMINISTRADOR
```

```bash
cd simulator && TOKEN=<el-token> npm run seed
```

Después, `npm run saturacion` lleva un contenedor al rojo en unos segundos y `npm run incendio`
dispara una alerta crítica. Son las dos cosas que conviene poder provocar a voluntad.

### El token

Todos los endpoints están protegidos menos el de CU-11. Hasta que el Squad 2 publique el login
federado (Sprint 3), los tokens se firman localmente con `npm run token:dev -- <ROL>` y duran 8
horas. Roles: `ADMINISTRADOR`, `OPERADOR`, `CHOFER`, `CIUDADANO`.

En desarrollo **la aplicación los carga sola** desde `VITE_DEV_TOKEN` y `VITE_DEV_TOKEN_CHOFER` en
`frontend/.env.local`, y elige cuál usar según la pantalla: `/chofer` necesita rol `CHOFER` y el
resto del módulo un `ADMINISTRADOR`. Vite borra ese código al compilar, así que no existe en el
build de producción.

---

## Mapa de pantallas

| Ruta | Pantalla | CU |
|---|---|---|
| `/mapa` | Mapa en vivo | CU-07 |
| `/contenedores` | Contenedores | CU-01 |
| `/contenedores/:id` | Detalle del contenedor | CU-01 + CU-12 |
| `/zonas` | Zonas y umbrales | CU-02 |
| `/alertas` | Alertas | CU-05 / CU-06 |
| `/flota` | Flota | CU-03 |
| `/rutas` | Rutas | CU-08 |
| `/rutas/:id` | Detalle de la ruta | CU-08 + CU-09 |

Y dos que corren **fuera del Shell**, porque no son del operador:

| Ruta | Pantalla | CU | Quién la usa |
|---|---|---|---|
| `/cerca` | Vista ciudadana | CU-11 | Cualquiera, sin login ni token |
| `/chofer` | Mi ruta | CU-10 | El chofer, desde el celular |

Estas dos no montan sidebar ni barra superior, y —clave para CU-11— **no disparan el conteo de
alertas**, que sin token sería un `401` en cada carga.

Las rutas están en castellano a propósito: espejan las del backend y las ve el usuario en la barra
de direcciones. El resto del código está en inglés.

---

# Los casos de uso

Las reglas en **negrita** son las que no se pueden pasar por alto: si alguien las ignora al tocar
el código, rompe algo que hoy funciona.

---

## CU-07 · Ver mapa en tiempo real

**Actor:** Operador · **Pantalla:** `/mapa`

La pantalla principal del módulo y la que se muestra en la demo. Marcadores coloreados por estado
sobre tiles de OpenStreetMap, filtros por zona, tipo de residuo y estado, tarjetas de resumen que
también funcionan como filtro, y un panel de detalle al hacer click.

**Dónde vive:** [`MapPage.jsx`](frontend/src/pages/MapPage.jsx) ·
[`ContainersMap.jsx`](frontend/src/components/ContainersMap.jsx) ·
[`ContainerPanel.jsx`](frontend/src/components/ContainerPanel.jsx) ·
[`useLiveMap.js`](frontend/src/hooks/useLiveMap.js)

**Consume:** `GET /mapa/contenedores`

**Reglas:**

- **Se refresca sola cada 30 segundos.** No hay WebSocket: está evaluado recién para el Sprint 5 y
  no hay que esperarlo. El intervalo es una constante única en `useLiveMap.js`.
- **El incendio se pinta aparte del color de estado.** El estado refleja el *llenado*; el incendio
  se evalúa contra la *temperatura*. Un contenedor verde al 8% puede estar prendido fuego, y ese es
  justo el caso que no se puede pasar por alto: lleva un halo naranja que late, además de su color.
- **Es una sola llamada.** El payload trae `incendioActivo`, `zonaNombre` y `umbralCriticoPct`.
  Antes había que cruzar una segunda llamada a `/alertas` en cada refresco y pedir la zona aparte.
- **Un contenedor que nunca reportó se dibuja translúcido.** No es lo mismo que uno vacío.
- **El filtro por estado se resuelve en el cliente, a propósito.** Si viajara al backend, la
  respuesta traería solo los del estado elegido y las otras cuatro tarjetas quedarían en cero, que
  es justo cuando dejan de servir: no podrías comparar ni saber a cuál saltar.

---

## CU-01 · Registrar contenedor y sensor

**Actor:** Administrador · **Pantallas:** `/contenedores` y `/contenedores/:id`

El caso de uso se llama "registrar", pero lo que hace falta es el **ABM completo**. Son seis
vistas, no una.

**Dónde vive:** [`ContainersPage.jsx`](frontend/src/pages/ContainersPage.jsx) ·
[`ContainerDetailPage.jsx`](frontend/src/pages/ContainerDetailPage.jsx) ·
[`ContainerFormModal.jsx`](frontend/src/components/containers/ContainerFormModal.jsx) ·
[`DeleteContainerModal.jsx`](frontend/src/components/containers/DeleteContainerModal.jsx) ·
[`LinkSensorModal.jsx`](frontend/src/components/containers/LinkSensorModal.jsx)

**Consume:** `GET/POST/PATCH/DELETE /contenedores` · `POST /contenedores/:id/sensor`

| Vista | Qué hace |
|---|---|
| Listado | Tabla con filtros, barra de llenado con marca de umbral por fila |
| Alta | El `codigo` es opcional: si va vacío, el backend genera `CT-0001`, `CT-0002`… |
| Edición | Mismo formulario, con el `codigo` deshabilitado |
| Baja | Confirmación que aclara que es **baja lógica** |
| Detalle | Zona y sensor anidados, alertas del contenedor, predicción (CU-12) |
| Vincular sensor | **La vista más delicada del módulo** |

**Reglas:**

- **La API key se muestra una única vez.** El backend guarda solo su hash. Si el usuario cierra el
  modal sin copiarla, la única salida es desvincular el sensor y volver a vincularlo. Por eso el
  modal no tiene ×, muestra la clave en un bloque grande y monoespaciado, tiene botón de copiar, y
  **no deja cerrar hasta que se confirma que fue guardada**. Es la única fricción deliberada de
  toda la aplicación.
- **El `codigo` no se puede editar.** Es el identificador operativo, el que está pegado con una
  calcomanía en la tapa. El backend no lo acepta en el `PATCH`.
- **La baja es lógica.** Se aclara en la confirmación porque cambia la decisión: si alguien cree
  que borra el histórico, no da de baja un contenedor roto y lo deja ensuciando el mapa. Ese
  histórico es el insumo del modelo predictivo de CU-12.
- **Un contenedor sin sensor nunca cambia de estado.** Se queda en `NORMAL` con 0% y sin fecha de
  última lectura para siempre. **Ese 0% no significa "vacío", significa "no reporta"**, y el
  detalle lo dice explícitamente.

---

## CU-02 · Definir zonas y umbrales

**Actor:** Administrador · **Pantalla:** `/zonas`

Una zona agrupa contenedores y define **a partir de qué porcentaje** uno de ellos se considera
crítico. En el centro conviene 70%; en zonas de baja densidad, 85% alcanza. También define el
umbral de temperatura que dispara una alerta de incendio.

La zona **no es un polígono dibujado sobre el mapa**: es una entidad con nombre y dos umbrales. El
recorte está justificado en [ADR-004](docs/adr/ADR-004-alcance-y-recortes.md) — la regla de negocio
que consume CU-05 es idéntica; el polígono es presentación, no dominio.

**Dónde vive:** [`ZonesPage.jsx`](frontend/src/pages/ZonesPage.jsx) ·
[`ZoneFormModal.jsx`](frontend/src/components/zones/ZoneFormModal.jsx) ·
[`DeleteZoneModal.jsx`](frontend/src/components/zones/DeleteZoneModal.jsx)

**Consume:** `GET/POST/PATCH/DELETE /zonas` · `PATCH /zonas/:id/bloqueo?bloqueada=`

**Reglas:**

- **Bajar un umbral no repinta el mapa en el acto.** Cada contenedor se reevalúa recién con su
  próxima lectura. El aviso aparece **solo cuando el umbral baja**, que es el único caso en que
  alguien espera ver medio barrio ponerse rojo y no pasa nada. Mostrarlo siempre lo convertiría en
  decorado que nadie lee.
- **No se puede borrar una zona con contenedores.** El botón se deshabilita con el conteo en el
  tooltip, en vez de dejar que el usuario descubra el límite chocándose contra un `409`.
- **El valor del bloqueo va como query param**, no en el cuerpo. Una zona bloqueada queda excluida
  del ruteo de CU-08. Hoy se bloquea a mano; desde el Sprint 4 lo va a disparar un incidente del
  módulo de Emergencias.

---

## CU-05 y CU-06 · Detectar contenedor crítico y riesgo de incendio

**Actor:** el sistema los genera, el Operador los atiende · **Pantalla:** `/alertas`

Estos dos casos de uso son reglas del backend, no pantallas. Pero sin un tablero donde atenderlas,
no se ven. Comparten pantalla porque comparten ciclo de vida.

**Dónde vive:** [`AlertsPage.jsx`](frontend/src/pages/AlertsPage.jsx) ·
[`AlertRow.jsx`](frontend/src/components/alerts/AlertRow.jsx)

**Consume:** `GET /alertas` · `PATCH /alertas/:id/atender` · `PATCH /alertas/:id/resolver`

**Reglas:**

- **La alerta se genera una sola vez, en la transición.** Si el sensor sigue reportando 81%, 87%,
  94%, no aparecen alertas nuevas. Sin esto, un contenedor saturado generaría una alerta cada 15
  minutos. Por eso el detalle de una alerta puede decir 76% mientras el mapa muestra 94%: **el
  estado del contenedor y la alerta son cosas distintas**. Un contenedor puede estar en `CRITICO`
  con su alerta ya `RESUELTA`.
- **El incendio no depende del llenado.** Se evalúa solo la temperatura contra el umbral de la
  zona, así que un contenedor al 5% —verde en el mapa— puede tener una alerta `CRITICA` abierta.
  Por eso los incendios sin resolver van en un **bloque rojo aparte, arriba de la lista**.
- **La máquina de estados es `ABIERTA → EN_ATENCION → RESUELTA`.** No se puede saltear ni volver
  atrás. Los botones se deshabilitan según el estado, con el motivo en el tooltip, en vez de dejar
  que el usuario se coma un `409 ALERTA_NO_ABIERTA`.
- Cada alerta trae `contenedorCodigo` en la respuesta. El listado de contenedores se pide una sola
  vez al montar, y solo para llenar el `<select>` del filtro.

---

## CU-12 · Predecir saturación de contenedor

**Actor:** Operador · **Tarjeta dentro de `/contenedores/:id`**

No es una pantalla nueva: es una tarjeta dentro del detalle del contenedor. Estima cuántas horas
faltan para que cruce el umbral de su zona, con una regresión lineal sobre su histórico de lecturas.

**No está en el documento de la cátedra**: lo agregó ADR-004 para cubrir la dimensión de IA/ML.

**Dónde vive:** [`PredictionCard.jsx`](frontend/src/components/containers/PredictionCard.jsx)

**Consume:** `GET /contenedores/:id/prediccion`

**Reglas:**

- **La confianza va al lado del número, no escondida abajo.** Una estimación con R² de 0,31 se ve
  idéntica a una de 0,93 si solo se muestra el titular, y sobre eso alguien planifica un camión.
- **Por debajo de 0,5 la tarjeta lo dice con todas las letras**: *"no planifiques con este
  número"*. El piso está en `CONFIDENCE_FLOOR`, en [`domain/states.js`](frontend/src/domain/states.js).
- **Si el umbral ya se cruzó, no promete un futuro.** Muestra "Umbral superado".
- **Solo se ajusta sobre el ciclo de llenado actual.** Si la ventana de lecturas cruza un vaciado,
  la serie sube, cae a cero y vuelve a subir, y una recta sobre eso no describe nada. Por eso
  `muestrasUsadas` puede ser mucho menor que el total de lecturas del contenedor.
- **Dos situaciones que no son fallas** y tienen su propio mensaje: menos de 3 lecturas en el ciclo
  (`SIN_LECTURAS_SUFICIENTES`) y el contenedor vaciándose, así que no hay saturación que predecir
  (`TENDENCIA_NO_CRECIENTE`). La segunda se muestra en verde: es una buena noticia, no un problema.

---

## CU-03 · Gestionar flota

**Actor:** Administrador · **Pantalla:** `/flota`

Un ABM chico, y a propósito: el caso de uso solo aporta valor junto con CU-08.

**Dónde vive:** [`FleetPage.jsx`](frontend/src/pages/FleetPage.jsx) ·
[`TruckFormModal.jsx`](frontend/src/components/fleet/TruckFormModal.jsx)

**Consume:** `GET/POST/PATCH /camiones`

**Reglas:**

- **No hay borrado, y es deliberado.** Un camión borrado seguiría colgando de las rutas históricas
  que ejecutó; se lo saca de circulación poniéndolo en `MANTENIMIENTO`. El endpoint no existe.
- **En el alta no se elige el estado.** Todo camión nace `DISPONIBLE`.
- **El estado solo se puede fijar a mano en `DISPONIBLE` o `MANTENIMIENTO`.** Mandar `EN_RUTA` da
  `400`. Ese estado lo pone la asignación de ruta (CU-09) y lo saca la última parada confirmada
  (CU-10). Permitirlo a mano abría una trampa sin salida: un camión marcado `EN_RUTA` sin ninguna
  ruta asociada quedaba trabado, porque no se le podía cambiar el estado y no había ninguna ruta
  que cerrar para liberarlo. El formulario ofrece solo esas dos opciones.
- **Un camión que ya está `EN_RUTA` no deja cambiarle el estado** (`409 CAMION_EN_RUTA`), pero sí
  editarle los demás campos.
- **`tipoResiduoHabilitado` no es decorativo:** decide qué contenedores puede levantar este camión
  cuando se genera una ruta. Uno de RECICLABLE nunca aparece para una ruta de ORGANICO.
- La patente **se normaliza**: `"  ab 123 cd  "` se guarda como `"AB123CD"`, y la detección de
  duplicados es sobre la patente normalizada.

---

## CU-08 · Generar ruta óptima

**Actor:** Operador (la calcula el sistema) · **Pantalla:** `/rutas`

Versión **heurística**, no optimización exacta: el problema completo es un *Vehicle Routing
Problem* con capacidad, que es NP-hard. El recorte está justificado en
[ADR-004](docs/adr/ADR-004-alcance-y-recortes.md).

**Dónde vive:** [`RoutesPage.jsx`](frontend/src/pages/RoutesPage.jsx) ·
[`GenerateRouteModal.jsx`](frontend/src/components/routes/GenerateRouteModal.jsx) ·
[`RouteMap.jsx`](frontend/src/components/routes/RouteMap.jsx)

**Consume:** `GET /rutas` · `POST /rutas/generar`

**Qué hace la heurística:** sale del depósito y en cada paso toma el contenedor crítico más cercano
que todavía entre en el camión. Filtra por tipo de residuo habilitado, saltea los que ya están
comprometidos en otra ruta viva y excluye las zonas bloqueadas. La distancia incluye la vuelta al
depósito.

**Reglas:**

- **La ruta nace `PROPUESTA` y el camión sigue `DISPONIBLE`.** Es una propuesta, no un compromiso:
  no la ve ningún chofer. Al generar se navega a la propuesta, porque lo que sigue es mirarla.
- **Solo se ofrecen camiones `DISPONIBLE`.** Los que están en ruta o en mantenimiento no se ocultan
  del todo: se dice cuántos quedaron afuera y por qué, porque *"no aparece mi camión"* es la
  pregunta que sigue.
- **Las zonas bloqueadas no se ofrecen** en el filtro.
- **El listado no trae las paradas** — eso lo expande solo el detalle. Por eso la tabla muestra la
  carga estimada en litros, que sí viene, y el avance por paradas está en el detalle de la ruta.

---

## CU-09 · Asignar ruta a camión y chofer

**Actor:** Operador · **Pantalla:** `/rutas/:id`

Revisar la propuesta y confirmarla. Recién ahí la ruta se vuelve real.

**Dónde vive:** [`RouteDetailPage.jsx`](frontend/src/pages/RouteDetailPage.jsx)

**Consume:** `GET /rutas/:id` · `PATCH /rutas/:id/asignar`

**Qué muestra:** el recorrido dibujado sobre el mapa con las paradas numeradas en orden, la lista
de paradas con su nivel de llenado, los datos del camión, la carga estimada como barra, y el panel
para asignar el chofer.

**Reglas:**

- **Generar y asignar están separados a propósito.** La heurística propone, una persona confirma.
  Es lo que pide el caso de uso por si la propuesta es absurda — y este es el único momento en que
  alguien lo puede notar. Por eso el recorrido, el orden y la carga se ven *antes* del botón.
- **Solo se asigna desde `PROPUESTA`.** Una ruta ya asignada no vuelve a ofrecer el botón.
- **Al confirmar, el camión queda tomado** y pasa a `EN_RUTA`.
- **La carga se muestra en barra** porque es el límite duro de la heurística: dice de un vistazo si
  la propuesta aprovecha el viaje o manda el camión medio vacío.
- **El chofer se escribe a mano.** La ruta trae `choferId` pero **no un objeto `chofer`**: no
  tenemos su nombre. Ver [la decisión pendiente](#1-el-endpoint-de-choferes--necesita-decisión-de-equipo).

---

## CU-10 · Confirmar vaciado

**Actor:** Chofer · **Pantalla:** `/chofer`

El chofer, parado en la vereda con el celular en la mano: una columna de 520 px, botones de 44 px
de alto mínimo y cabecera fija con el progreso. Por eso vive fuera del panel del operador.

**Dónde vive:** [`DriverStopsPage.jsx`](frontend/src/pages/DriverStopsPage.jsx) ·
[`RouteMap.jsx`](frontend/src/components/routes/RouteMap.jsx) (reusado con un prop `me` opcional) ·
[`useGeolocation.js`](frontend/src/hooks/useGeolocation.js)

**Consume:** `GET /rutas/mias` · `PATCH /paradas/:id/confirmar`

**Reglas:**

- **`fetchMyRoute()` no toma argumentos.** La identidad del chofer sale del `sub` del JWT: si
  viajara por query string, cualquiera podría leer la ruta de otro cambiando un valor. Hay un test
  que verifica que no se le agregue un `choferId` a la URL.
- **El backend devuelve cuerpo vacío con `200`** cuando no hay ruta activa, y `client.js` lo
  convierte en `null`. Terminar el turno no es un error, así que no es un `404`.
- **Se confirma con un solo tap.** La posición se pide **fresca en cada confirmación**: el chofer
  se movió entre una parada y la siguiente.
- **Valida que el chofer esté a menos de 100 metros.** Fuera de radio, la pantalla suma **a cuántos
  metros está** — el backend dice qué pasó, la UI dice cuánto falta, que es lo único accionable
  estando parado en la calle.
- **Un chofer solo confirma paradas de su propia ruta** (`403 PARADA_DE_OTRA_RUTA`). Sin eso,
  cualquiera con un id de parada podía cerrar el trabajo de otro. La pantalla recarga la ruta en
  vez de dejarlo insistiendo con un botón que no puede funcionar.
- **Una parada ya confirmada es información, no error**: casi siempre es un doble tap.
- **No hay carga manual de coordenadas**, a diferencia de CU-11: dejarle escribir la posición al
  chofer anula el único control que tiene este caso de uso.
- **La confirmación dispara un efecto en cascada:** el contenedor vuelve a `NORMAL` y 0%, se
  cierran sus alertas de saturación (`alertasCerradas` es un **número**, no una lista de ids), la
  primera confirmación pasa la ruta a `EN_CURSO` y **la última la cierra y libera el camión**. Sin
  eso el camión quedaría `EN_RUTA` para siempre. Las cinco pantallas cuentan la misma historia sin
  coordinarse.
- El contenedor vuelve a `NORMAL` **salvo que esté `FUERA_DE_SERVICIO`**: lo que tiene roto es el
  sensor o la tapa, no el nivel.
- **`OMITIDA` se muestra pero no se puede setear.** El estado existe en el modelo y la lista lo
  pinta, pero no hay endpoint que lo produzca.
- **Recortado:** sin soporte offline ([ADR-004](docs/adr/ADR-004-alcance-y-recortes.md)). Es el
  ítem más caro del relevamiento y ninguna dimensión de la rúbrica lo exige.

**El toggle "Simular que estoy en el contenedor"** está detrás de `VITE_SIMULAR_GPS`, apagada por
defecto. Es un bypass del único control del caso de uso, así que no existe en ningún entorno que no
sea una demo. Hace falta porque los contenedores del seed están en el Obelisco y cualquiera que
pruebe está a kilómetros: sin él, el camino feliz no se puede mostrar nunca. Con el toggle apagado
se sigue demostrando el `403`.

---

## CU-11 · Consultar contenedores cercanos

**Actor:** cualquier vecino · **Pantalla:** `/cerca`

*"Tengo pilas usadas, ¿dónde las tiro?"*. La única pantalla pública del módulo: sin sidebar, sin
login y sin token.

**Dónde vive:** [`NearbyContainersPage.jsx`](frontend/src/pages/NearbyContainersPage.jsx) ·
[`NearbyMap.jsx`](frontend/src/components/public/NearbyMap.jsx) ·
[`useGeolocation.js`](frontend/src/hooks/useGeolocation.js)

**Consume:** `GET /publico/contenedores/cercanos?lat=&lng=&radioMetros=&tipoResiduo=` — **sin
`Authorization`**, vía `apiPublic` en [`api/client.js`](frontend/src/api/client.js).

**Reglas:**

- **Lo que no muestra es tan parte del caso de uso como lo que muestra.** Devuelve exactamente seis
  campos: `id`, `codigo`, `lat`, `lng`, `tipoResiduo` y `distanciaMetros`. Ni estado, ni nivel de
  llenado, ni temperatura, ni alertas: eso es información operativa interna del municipio. La
  proyección en el backend es campo por campo, nunca un spread, y hay un test que falla si algún
  día se cuela uno de más.
- **`apiPublic` no manda el header aunque haya un token guardado.** Un operador logueado que abre
  la vista ciudadana no filtra su identidad a un endpoint anónimo. Verificado.
- **Los contenedores `FUERA_DE_SERVICIO` no aparecen.** Mandar a alguien caminando hasta un
  contenedor roto es peor que no listarlo. Ojo con la diferencia: se filtra *por* el estado, pero
  no se *expone* el estado.
- **Sin resultados devuelve una lista vacía, no un error.** No encontrar contenedores cerca es un
  resultado válido.
- **No pide el permiso de GPS al montar.** Un prompt de ubicación antes de que la persona entienda
  qué pantalla está mirando es exactamente lo que se deniega. Se pide cuando aprieta el botón.
- **Si deniega, el mensaje dice qué hacer** ("podés activarlo desde el candado de la barra de
  direcciones"), y se abre solo el formulario manual con tres presets.
- **No hay buscador de direcciones.** Geocodificar necesita un servicio externo, y eso significa
  mandarle a un tercero dónde está parada la persona. Por la misma razón no hay link a Google Maps.
- **Los marcadores se colorean por tipo de residuo, no por estado**: el estado no viene en este
  payload y no debería.

---

## CU-04 · Reportar nivel de llenado

**Actor:** el sensor (un aparato, no una persona) · **Sin pantalla**

Es la puerta de entrada de los datos y el disparador de todo el dominio: cada lectura que entra
actualiza el contenedor y dispara las reglas de CU-05 y CU-06.

`POST /lecturas` se autentica con el header `X-Sensor-Key`, **no con JWT**: un sensor es un
dispositivo, no una persona con sesión.

**No tiene pantalla y no la va a tener.** El frontend nunca llama a este endpoint. El simulador de
`simulator/` es lo que hace este papel en desarrollo y en la demo.

---

# Cómo se conecta el frontend

Ninguna pantalla importa datos de otro lado que [`api/waste.js`](frontend/src/api/waste.js), que
elige entre la API real y un servidor falso en memoria según una variable de entorno:

```bash
# frontend/.env.local
VITE_USE_MOCKS=false
```

Con `false`, las llamadas pasan a [`waste.http.js`](frontend/src/api/waste.http.js) y de ahí a
[`client.js`](frontend/src/api/client.js), que pone el token y **normaliza los errores para que la
aplicación ramifique por `code` y nunca por el texto del mensaje** — el mensaje está en castellano
y puede cambiar; el código es parte del contrato. Las pantallas no se tocan.

El plan original era borrar `src/mocks/` al conectar
([ADR-007](docs/adr/ADR-007-design-system-y-mocks.md)). Se decidió **conservarlo y alinearlo al
contrato real**: sirve para mostrar la aplicación sin levantar Docker ni la API, y el interruptor
solo tiene sentido si las dos fuentes devuelven exactamente lo mismo.

> **Un mock más generoso que la API esconde errores hasta el peor momento.** Pasó con `GET /rutas`:
> el mock traía las paradas y el backend no, la pantalla de rutas se escribió contra esa forma, el
> fixture del test repetía la misma invención, y los tres mentían igual. Los tests daban verde
> mientras la pantalla se caía al conectar.

---

# Qué falta

Nada de esto es código a medio hacer. Son trámites, una decisión de equipo y pedidos de contrato.

## Bloqueante: los dos pull requests

**Hoy el trabajo está en ramas separadas y no llegó a `develop`.**

1. **Francisco tiene que abrir primero el PR de `feat/CU-12-prediccion` a `develop`.** Su rama
   tiene los 12 casos de uso del backend y todavía no está en la rama común.
2. **Después va el PR del frontend** desde `feat/CU-07-mapa-tiempo-real`. El orden importa: la rama
   del frontend está construida sobre la del backend, así que si va primero arrastra los commits de
   Francisco sin que nadie los haya revisado.

Dos detalles del proceso: **GitHub propone `main` por defecto y el destino tiene que ser
`develop`**, y **nadie mergea su propio PR**.

## 1. El endpoint de choferes — necesita decisión de equipo

**El problema:** para asignarle una ruta a un chofer (CU-09), hoy el operador **escribe el
identificador a mano** en un campo de texto. No hay una lista de la que elegir.

**Por qué:** los choferes son usuarios del módulo de identidad del Squad 2, no entidades de
Residuos. Mantener acá un padrón propio significaría tener una copia de sus datos que se
desincroniza con la fuente real.

**La consecuencia concreta:** el `choferId` es un string libre y **el backend no lo valida contra
ningún padrón** — por eso tampoco existe `CHOFER_NO_ENCONTRADO`. Un identificador mal tipeado
asigna la ruta igual, y el chofer nunca la ve. La pantalla lo avisa explícitamente, pero avisar no
es resolver.

**Hay que decidirlo con Nicolás y Adriel.** Las dos opciones son pedirle al Squad 2 un endpoint que
liste usuarios por rol, o aceptar que el operador escriba el identificador y validarlo de otra
forma.

## 2. Cuatro pedidos de contrato al backend

Ninguno bloquea la demo. Los cuatro son límites que están **visibles en la UI a propósito**, en vez
de disimulados.

| Qué falta | Qué pasa hoy |
|---|---|
| **No se puede poner un contenedor en `FUERA_DE_SERVICIO`** | El estado existe en el modelo y el motor de reglas lo respeta, pero `PATCH /contenedores/:id` no acepta `estado` y no hay otro endpoint. El botón está en el detalle, deshabilitado y con el motivo en el tooltip. |
| **`GET /contenedores` no dice si el contenedor ya tiene sensor** | No devuelve `sensor` ni un `tieneSensor`. La UI deja intentar y muestra el `409 CONTENEDOR_YA_TIENE_SENSOR` si corresponde. En el listado no se puede distinguir "sin sensor" de "sensor que nunca reportó". |
| **`GET /rutas` no trae el avance de paradas** | El listado no incluye las paradas, así que la tabla no puede mostrar "2 de 3 vaciadas" sin una llamada por fila. Hoy muestra la carga estimada en litros, que sí viene. |
| **No hay endpoint para omitir una parada** | `OMITIDA` existe en el modelo y la pantalla lo dibuja, pero el único endpoint es `/confirmar`. El caso real es el chofer que llega y no puede vaciar: auto mal estacionado, calle cortada. |

## 3. Lo que depende de otros equipos

- **El login del Squad 2 llega en el Sprint 3.** Hasta entonces los tokens se generan a mano y
  duran 8 horas. Cuando exista el login real cambia de dónde sale el token, pero el header
  `Authorization: Bearer <jwt>` no cambia.
- **El bloqueo automático de zonas** cuando llega un incidente del módulo de Emergencias es del
  Sprint 4. Hoy se bloquea a mano.

## 4. Recortes deliberados — esto NO es deuda

Están decididos y documentados en [ADR-004](docs/adr/ADR-004-alcance-y-recortes.md). No hay que
"completarlos":

- **Zonas sin polígonos** dibujados sobre el mapa. Son una agrupación lógica.
- **Ruteo por vecino más cercano**, no un VRP exacto.
- **Sin soporte offline** en la pantalla del chofer.
- **Sin WebSocket** en el mapa: polling cada 30 segundos. Evaluado para el Sprint 5 si sobra
  tiempo.

---

# Tests del frontend

**177 tests en 25 archivos, todos en verde.** Cobertura de líneas 81,79%, contra un umbral
configurado de 60% en `vite.config.js` (dimensión 6 de la rúbrica). El CI corre lint, build y
cobertura de backend y frontend en cada push.

```bash
cd frontend && npm test          # los 177
cd frontend && npm run cobertura # con reporte de cobertura
```

`src/mocks/` queda **fuera del cómputo de cobertura**: es andamiaje, y exigirle tests sería pagar
por código que no llega a producción.

---

## Documentos relacionados

- [Guía de integración](docs/arquitectura/guia-frontend.md) — el contrato de la API, con capturas
  reales de cada endpoint
- [README del frontend](frontend/README.md) — estructura de carpetas y convención de idioma
- [ADR-004](docs/adr/ADR-004-alcance-y-recortes.md) — qué se recortó de cada caso de uso y por qué
- [ADR-005](docs/adr/ADR-005-seguridad-identidad.md) — identidad, roles y el contrato con el Squad 2
- [ADR-006](docs/adr/ADR-006-stack-frontend.md) — por qué React + Vite + Leaflet
- [ADR-007](docs/adr/ADR-007-design-system-y-mocks.md) — design system, router y capa de mocks
