# Casos de uso — estado del frontend

Qué pantalla cubre cada caso de uso, dónde vive en el código y qué falta.

> **Ninguna pantalla está conectada al backend todavía.** Todas corren contra el servidor falso de
> [`src/mocks/`](src/mocks). Se levanta con `npm run dev` y `VITE_USE_MOCKS=true`, sin API, sin
> Docker y sin token. Conectar es apagar esa variable — ver [Cómo se conecta](#cómo-se-conecta).

Actualizado al **2026-08-21**.

---

## De un vistazo

| CU | Nombre | Pantalla | Diseño | Contrato del backend |
|---|---|---|---|---|
| CU-01 | Registrar contenedor y sensor | Contenedores | Hecho | Implementado y verificado |
| CU-02 | Definir zonas y umbrales | Zonas y umbrales | Hecho | Implementado y verificado |
| CU-03 | Gestionar flota | Flota | Hecho | **Borrador** |
| CU-04 | Reportar nivel de llenado | — | No aplica | Implementado y verificado |
| CU-05 | Detectar contenedor crítico | Alertas | Hecho | Implementado y verificado |
| CU-06 | Detectar riesgo de incendio | Alertas | Hecho | Implementado y verificado |
| CU-07 | Ver mapa en tiempo real | Mapa en vivo | Hecho | Implementado y verificado |
| CU-08 | Generar ruta óptima | Rutas | Hecho | **Borrador** |
| CU-09 | Asignar ruta a camión y chofer | Detalle de la ruta | Hecho | **Borrador** |
| CU-10 | Confirmar vaciado | — | **Falta** | **Borrador** |
| CU-11 | Consultar contenedores cercanos | — | **Falta** | **Borrador** |
| CU-12 | Predecir saturación | Detalle del contenedor | Hecho | **Endpoint pendiente** |

**9 diseñados · 1 sin pantalla · 2 pendientes.**

### Qué significa cada estado de contrato

- **Implementado y verificado** — el endpoint existe, anda, y los ejemplos de
  [`guia-frontend.md`](../docs/arquitectura/guia-frontend.md) son capturas reales de la API. La
  pantalla no va a cambiar cuando se conecte.
- **Borrador** — el contrato está escrito en
  [`api-preliminar.md`](../docs/arquitectura/api-preliminar.md) pero Francisco todavía no lo
  implementó. Puede cambiar. Como no estamos conectados, lo que se rehace es el mock, no la
  pantalla.
- **Endpoint pendiente** — el contrato está cerrado pero el endpoint no existe todavía.

---

## Secciones de la aplicación

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

Las rutas están en castellano a propósito: espejan las del backend y las ve el usuario en la barra
de direcciones. El resto del código está en inglés (ver [README](README.md#idioma-del-código)).

---

# Los casos de uso diseñados

## CU-07 · Ver mapa en tiempo real

La pantalla principal del módulo y la que se muestra en la demo.

**Dónde vive:** [`pages/MapPage.jsx`](src/pages/MapPage.jsx) ·
[`components/ContainersMap.jsx`](src/components/ContainersMap.jsx) ·
[`components/ContainerPanel.jsx`](src/components/ContainerPanel.jsx) ·
[`hooks/useLiveMap.js`](src/hooks/useLiveMap.js)

**Consume:** `GET /mapa/contenedores` + `GET /alertas?tipo=INCENDIO&estado=ABIERTA`

**Qué hace:** marcadores coloreados por estado sobre tiles de OpenStreetMap, filtros por zona,
tipo de residuo y estado, tarjetas de resumen que también funcionan como filtro, y un panel de
detalle al hacer click.

**Reglas que resuelve la pantalla:**

- **Se refresca sola cada 30 segundos.** No hay WebSocket; está evaluado recién para el Sprint 5.
  El intervalo es una constante única en `useLiveMap.js`.
- **El incendio se pinta aparte del color de estado.** El estado del contenedor refleja el
  *llenado*; el incendio se evalúa contra la *temperatura*. Un contenedor verde al 8% puede estar
  prendido fuego, y ese es justo el caso que no se puede pasar por alto: lleva un halo naranja que
  late, además de su color.
- **Un contenedor que nunca reportó se dibuja translúcido.** No es lo mismo que uno vacío.

**Por qué se piden dos endpoints:** `GET /mapa/contenedores` no informa nada de alertas. El cruce
se hace en el cliente. Si el backend agrega esa información al payload, la segunda llamada
desaparece.

---

## CU-01 · Registrar contenedor y sensor

El caso de uso se llama "registrar", pero lo que hace falta es el **ABM completo**. Son seis
vistas, no una.

**Dónde vive:** [`pages/ContainersPage.jsx`](src/pages/ContainersPage.jsx) ·
[`pages/ContainerDetailPage.jsx`](src/pages/ContainerDetailPage.jsx) ·
[`components/containers/ContainerFormModal.jsx`](src/components/containers/ContainerFormModal.jsx) ·
[`components/containers/DeleteContainerModal.jsx`](src/components/containers/DeleteContainerModal.jsx) ·
[`components/containers/LinkSensorModal.jsx`](src/components/containers/LinkSensorModal.jsx)

**Consume:** `GET/POST/PATCH/DELETE /contenedores` · `POST /contenedores/:id/sensor`

| Vista | Qué hace |
|---|---|
| Listado | Tabla con filtros, barra de llenado con marca de umbral por fila |
| Alta | El `codigo` es opcional: si va vacío, el backend genera `CT-0001`, `CT-0002`… |
| Edición | Mismo formulario, con el `codigo` deshabilitado |
| Baja | Confirmación que aclara que es **baja lógica** |
| Detalle | Zona y sensor anidados, alertas del contenedor, predicción (CU-12) |
| Vincular sensor | **La vista más delicada del módulo** |

**Reglas que resuelve la pantalla:**

- **La API key se muestra una única vez.** El backend guarda solo su hash. Si el usuario cierra el
  modal sin copiarla, la única salida es desvincular el sensor y volver a vincularlo. Por eso el
  modal no tiene ×, muestra la clave en un bloque grande y monoespaciado, tiene botón de copiar, y
  **no deja cerrar hasta que se confirma que fue guardada**. Es la única fricción deliberada de
  toda la aplicación.
- **El `codigo` no se puede editar.** Es el identificador operativo, el que está pegado con una
  calcomanía en la tapa. El backend no lo acepta en el `PATCH`.
- **La baja es lógica.** Se aclara en la confirmación porque cambia la decisión: si alguien cree
  que borra el histórico, no da de baja un contenedor roto y lo deja ensuciando el mapa. El
  histórico de lecturas es el insumo del modelo predictivo de CU-12.
- **Un contenedor sin sensor nunca cambia de estado.** El detalle lo dice explícitamente: el 0%
  que muestra no significa que esté vacío.

**Limitaciones conocidas:** ver [Pedidos de contrato](#pedidos-de-contrato-pendientes) 1 y 2.

---

## CU-02 · Definir zonas y umbrales

La zona no es un polígono dibujado sobre el mapa: es una entidad con nombre y dos umbrales. El
recorte está justificado en [ADR-004](../docs/adr/ADR-004-alcance-y-recortes.md) — la regla de
negocio que consume CU-05 es idéntica; el polígono es presentación, no dominio.

**Dónde vive:** [`pages/ZonesPage.jsx`](src/pages/ZonesPage.jsx) ·
[`components/zones/ZoneFormModal.jsx`](src/components/zones/ZoneFormModal.jsx) ·
[`components/zones/DeleteZoneModal.jsx`](src/components/zones/DeleteZoneModal.jsx)

**Consume:** `GET/POST/PATCH/DELETE /zonas` · `PATCH /zonas/:id/bloqueo?bloqueada=`

**Reglas que resuelve la pantalla:**

- **Bajar un umbral no repinta el mapa en el acto.** Cada contenedor se reevalúa recién con su
  próxima lectura. El aviso aparece **solo cuando el umbral baja**, que es el único caso en que
  alguien espera ver medio barrio ponerse rojo y no pasa nada. Mostrarlo siempre lo convertiría en
  decorado que nadie lee.
- **No se puede borrar una zona con contenedores.** El botón se deshabilita con el conteo en el
  tooltip, en vez de dejar que el usuario descubra el límite chocándose contra un `409`.
- **El valor del bloqueo va como query param**, no en el cuerpo. Una zona bloqueada queda excluida
  del ruteo de CU-08.

---

## CU-05 y CU-06 · Detectar contenedor crítico y riesgo de incendio

Estos dos casos de uso son reglas del backend, no pantallas. Pero sin un tablero donde atenderlas,
no se ven. Comparten pantalla porque comparten ciclo de vida.

**Dónde vive:** [`pages/AlertsPage.jsx`](src/pages/AlertsPage.jsx) ·
[`components/alerts/AlertRow.jsx`](src/components/alerts/AlertRow.jsx)

**Consume:** `GET /alertas` · `PATCH /alertas/:id/atender` · `PATCH /alertas/:id/resolver`

**Reglas que resuelve la pantalla:**

- **La máquina de estados es `ABIERTA → EN_ATENCION → RESUELTA`.** No se puede saltear ni volver
  atrás. Los botones se deshabilitan según el estado, con el motivo en el tooltip, en vez de dejar
  que el usuario se coma un `409 ALERTA_NO_ABIERTA`.
- **Los incendios sin resolver van en un bloque rojo aparte, arriba.** Máxima prioridad, y pueden
  corresponder a contenedores que en el mapa están verdes.
- **La alerta se genera una sola vez, en la transición.** Si el sensor sigue reportando 81%, 87%,
  94%, no aparecen alertas nuevas. Por eso el detalle de una alerta puede decir 76% mientras el
  mapa muestra 94%: **el estado del contenedor y la alerta son cosas distintas**.
- **El código del contenedor se cruza en el cliente.** `GET /alertas` trae `contenedorId` pero no
  el código; pedir el detalle de cada alerta sería una llamada por fila para mostrar seis
  caracteres.

---

## CU-12 · Predecir saturación de contenedor

No es una pantalla nueva: es una tarjeta dentro del detalle del contenedor.

**Dónde vive:** [`components/containers/PredictionCard.jsx`](src/components/containers/PredictionCard.jsx)

**Consume:** `GET /contenedores/:id/prediccion` — **el endpoint todavía no existe.**

**Qué muestra:** cuánto falta para cruzar el umbral ("en 1,8 h"), la fecha estimada, la tasa de
llenado por hora, cuántas lecturas usó la regresión y con cuánta confianza.

**Reglas que resuelve la pantalla:**

- **La confianza va al lado del número, no escondida abajo.** Una estimación con R² de 0,31 se ve
  idéntica a una de 0,93 si solo se muestra el titular, y sobre eso alguien planifica un camión.
- **Por debajo de 0,5 la tarjeta lo dice con todas las letras**: *"no planifiques con este
  número"*. El piso está en `CONFIDENCE_FLOOR`, en [`domain/states.js`](src/domain/states.js).
- **Si el umbral ya se cruzó, no promete un futuro.** Muestra "Umbral superado".
- **Un contenedor sin lecturas ni siquiera pregunta.** La regresión se hace sobre el histórico de
  `LECTURA`; sin lecturas no hay recta que ajustar, y llamar al endpoint sería pedir un error a
  propósito.

---

## CU-03 · Gestionar flota

Un ABM chico, y a propósito: el caso de uso solo aporta valor junto con CU-08.

**Dónde vive:** [`pages/FleetPage.jsx`](src/pages/FleetPage.jsx) ·
[`components/fleet/TruckFormModal.jsx`](src/components/fleet/TruckFormModal.jsx)

**Consume:** `GET/POST/PATCH /camiones`

**Reglas que resuelve la pantalla:**

- **No hay borrado.** El contrato expone `POST`, `GET` y `PATCH` y nada más. Un camión borrado
  seguiría colgando de las rutas históricas que ejecutó; se lo saca de circulación poniéndolo en
  `MANTENIMIENTO`.
- **En el alta no se elige el estado.** Todo camión nace `DISPONIBLE`.
- **Un camión `EN_RUTA` no deja cambiarle el estado a mano.** Primero hay que cerrar o cancelar su
  ruta; si no, quedaría una ruta viva apuntando a un camión en mantenimiento.
- **`tipoResiduoHabilitado` no es decorativo:** decide qué contenedores puede levantar este camión
  cuando se genera una ruta.

---

## CU-08 · Generar ruta óptima

Versión **heurística**, no optimización exacta: el problema completo es un *Vehicle Routing
Problem* con capacidad, que es NP-hard. El recorte está justificado en
[ADR-004](../docs/adr/ADR-004-alcance-y-recortes.md).

**Dónde vive:** [`pages/RoutesPage.jsx`](src/pages/RoutesPage.jsx) ·
[`components/routes/GenerateRouteModal.jsx`](src/components/routes/GenerateRouteModal.jsx) ·
[`components/routes/RouteMap.jsx`](src/components/routes/RouteMap.jsx)

**Consume:** `GET /rutas` · `POST /rutas/generar`

**Qué hace la heurística** (implementada en el mock, en
[`mocks/server.js`](src/mocks/server.js)): sale del depósito y en cada paso toma el contenedor
crítico más cercano que todavía entre en el camión. Filtra por tipo de residuo habilitado, saltea
los que ya están en otra ruta viva y excluye las zonas bloqueadas.

**Reglas que resuelve la pantalla:**

- **Solo se ofrecen camiones `DISPONIBLE`.** Los que están en ruta o en mantenimiento no se ocultan
  del todo: se dice cuántos quedaron afuera y por qué, porque *"no aparece mi camión"* es la
  pregunta que sigue.
- **Las zonas bloqueadas no se ofrecen** en el filtro.
- **La ruta nace como propuesta.** No toma el camión ni la ve ningún chofer. Al generar se navega
  a la propuesta, porque lo que sigue es mirarla, no archivarla.

---

## CU-09 · Asignar ruta a camión y chofer

**Dónde vive:** [`pages/RouteDetailPage.jsx`](src/pages/RouteDetailPage.jsx)

**Consume:** `GET /rutas/:id` · `PATCH /rutas/:id/asignar`

**Qué muestra:** el recorrido dibujado sobre el mapa con las paradas numeradas en orden, la lista
de paradas con su nivel de llenado, los datos del camión, la carga estimada como barra, y el panel
para elegir chofer y confirmar.

**Reglas que resuelve la pantalla:**

- **Generar y asignar están separados a propósito.** La heurística propone, una persona confirma.
  Es exactamente lo que pide el caso de uso por si la propuesta es absurda — y este es el único
  momento en que alguien lo puede notar. Por eso el recorrido, el orden y la carga se ven *antes*
  del botón.
- **Solo se asigna desde `PROPUESTA`.** Una ruta ya asignada no vuelve a ofrecer el botón.
- **Al confirmar, el camión queda tomado** y pasa a `EN_RUTA`.
- **La carga se muestra en barra** porque es el límite duro de la heurística: dice de un vistazo si
  la propuesta aprovecha el viaje o manda el camión medio vacío.

**Limitación conocida:** ver [Pedido de contrato](#pedidos-de-contrato-pendientes) 3.

---

# Los que no están

## CU-04 · Reportar nivel de llenado — sin pantalla

`POST /lecturas` lo llaman **los sensores**, autenticándose con el header `X-Sensor-Key`, no con
JWT: un sensor es un dispositivo, no una persona con sesión. No hay nada que diseñar.

Es el disparador de todo el dominio: cada lectura que entra actualiza el contenedor y dispara las
reglas de CU-05 y CU-06. Es de donde salen los datos que se ven cambiar en el mapa.

## CU-11 · Consultar contenedores cercanos — falta

**Por qué no está:** es un layout entero aparte. Sin sidebar, sin login y sin token — es la vista
pública para el ciudadano.

**Qué necesitaría:** buscador de ubicación, radio en metros, filtro por tipo de residuo, mapa y
lista de cercanos. Resuelto con la fórmula de Haversine sobre lat/lng.

**Ojo:** no expone nivel de llenado ni alertas. Eso es información operativa interna.

## CU-10 · Confirmar vaciado — falta

**Por qué no está:** es una pantalla móvil, para el chofer en la calle. Otro layout y otro tipo de
interacción.

**Qué necesitaría:** la lista de paradas de "mi ruta", confirmar vaciado con validación de GPS por
radio (100 m por defecto), y el manejo del `403` cuando el chofer está fuera del radio permitido.

**Recortado:** sin soporte offline. Es el ítem más caro del relevamiento y ninguna dimensión de la
rúbrica lo exige (ADR-004).

---

# Cómo se conecta

Ninguna pantalla importa datos de otro lado que [`src/api/waste.js`](src/api/waste.js), que elige
entre la API real y el servidor falso según una variable de entorno:

```bash
# .env.local
VITE_USE_MOCKS=false
```

Con eso, las llamadas pasan a [`api/waste.http.js`](src/api/waste.http.js) y de ahí a
[`api/client.js`](src/api/client.js), que pone el token y normaliza los errores. **Las pantallas no
se tocan.**

Los mocks fallan con los mismos `code` estables que el backend
(`ZONA_CON_CONTENEDORES`, `CONTENEDOR_YA_TIENE_SENSOR`, `ALERTA_NO_ABIERTA`, `HTTP_400` con
`message` como array), así que las pantallas de error ya están diseñadas contra el comportamiento
real y no contra un backend imaginario.

Cuando las nueve estén conectadas se borra `src/mocks/`, se borra la variable, y `waste.js` vuelve
a ser un re-export de `waste.http.js`. Está documentado en
[ADR-007](../docs/adr/ADR-007-design-system-y-mocks.md).

---

# Pedidos de contrato pendientes

Tres límites del backend que están **visibles en la UI a propósito**, en vez de disimulados:

1. **No hay forma de poner un contenedor en `FUERA_DE_SERVICIO`.** El estado existe en el enum y el
   motor de reglas lo respeta, pero `PATCH /contenedores/:id` no acepta `estado` y no hay otro
   endpoint. El botón está en el detalle, deshabilitado y con el motivo en el tooltip.
2. **El listado de contenedores no dice si ya tienen sensor.** `GET /contenedores` no devuelve
   `sensor` ni un `tieneSensor`. La UI deja intentar y muestra el
   `409 CONTENEDOR_YA_TIENE_SENSOR` si corresponde.
3. **No hay endpoint para listar choferes.** `RUTA.choferId` apunta a un usuario con rol `CHOFER`
   del directorio del Squad 2 ([ADR-005](../docs/adr/ADR-005-seguridad-identidad.md)), y CU-09
   necesita poblar un `<select>` con ellos. Hoy salen de datos falsos y la pantalla lo dice.

Hay otros tres pedidos que no se ven en pantalla pero encarecen el cliente: el payload del mapa no
informa alertas (obliga a la segunda llamada), `GET /alertas` no trae el código del contenedor, y
el payload del mapa no trae `zonaNombre` ni `umbralCriticoPct`.

---

# Estado de los tests

**115 tests, todos en verde.** Cobertura: 81,5% de sentencias, 86,4% de líneas. El umbral que
fuerza el CI es 60% (dimensión 6 de la rúbrica).

| Área | Tests |
|---|---|
| Dominio (estados, errores, alertas, predicción, flota) | 23 |
| Cliente HTTP y rutas de la API | 12 |
| Hook del mapa en vivo | 5 |
| Contenedores (listado, detalle, panel, API key, predicción) | 26 |
| Zonas | 7 |
| Alertas | 11 |
| Flota | 6 |
| Rutas | 14 |
| Shell y navegación | 6 |

`src/mocks/` queda **fuera del cómputo de cobertura**: es andamiaje con fecha de vencimiento, y
exigirle tests sería pagar por código que no llega a producción.

---

## Documentos relacionados

- [README del frontend](README.md) — cómo levantarlo, estructura de carpetas, convención de idioma
- [Guía de integración](../docs/arquitectura/guia-frontend.md) — contratos reales, con capturas de la API
- [API preliminar](../docs/arquitectura/api-preliminar.md) — contratos borrador de lo que falta
- [ADR-006](../docs/adr/ADR-006-stack-frontend.md) — por qué React + Vite + Leaflet
- [ADR-007](../docs/adr/ADR-007-design-system-y-mocks.md) — design system, router y capa de mocks
- [ADR-004](../docs/adr/ADR-004-alcance-y-recortes.md) — qué se recortó de cada caso de uso y por qué
