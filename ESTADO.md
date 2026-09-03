# Estado del módulo de Residuos — Squad 4

Qué hace cada caso de uso, qué está terminado y qué falta. Actualizado al **2026-09-03**.

Para el detalle del contrato de la API, ver
[docs/arquitectura/guia-frontend.md](docs/arquitectura/guia-frontend.md), que tiene capturas
reales de cada endpoint.

---

## Resumen en tres líneas

- **Los 12 casos de uso están implementados de punta a punta**, backend y frontend, corriendo
  contra PostgreSQL. No queda ninguna pantalla con datos falsos.
- Lo que falta **no es código**: dos pull requests, una decisión de equipo y cuatro pedidos de
  contrato menores.
- El ciclo completo funciona verificado: contenedor satura → se genera la alerta → se arma la
  ruta → se asigna al chofer → el chofer confirma → el contenedor vuelve a verde, la alerta se
  cierra y el camión queda libre.

| | |
|---|---|
| Casos de uso | 12 de 12 implementados |
| Pantallas | 10 |
| Tests del frontend | 177, en verde |
| Cobertura del frontend | 81,79% de líneas (la cátedra exige 60%) |
| CI | Corre lint, build y tests de backend **y** frontend |

---

## Los 12 casos de uso, en detalle

### Cómo leer esta sección

**Actor** es quién lo usa. **Pantalla** es la ruta del frontend. Las reglas que están en negrita
son las que no se pueden pasar por alto: si alguien las ignora al tocar el código, rompe algo que
hoy funciona.

---

### CU-01 · Registrar contenedor y sensor

**Actor:** Administrador · **Pantallas:** `/contenedores` y `/contenedores/:id`

El ABM de contenedores. Cada contenedor tiene una ubicación, una zona, un tipo de residuo y una
capacidad. Aparte se le puede vincular un sensor, que es el aparato físico que después reporta
cuánto se llenó.

Reglas que importan:

- El `codigo` (CT-0001, CT-0002…) es **opcional en el alta**: si no lo mandás, el backend lo
  genera solo. Pero **no se puede editar después**, porque es el identificador operativo con el
  que la gente de la calle se refiere al contenedor.
- **La API key del sensor se muestra una sola vez.** El backend guarda solo su hash, así que si
  el usuario cierra el modal sin copiarla, la única salida es desvincular y volver a vincular. Por
  eso la pantalla la muestra en un modal explícito con botón de copiar y un aviso, y no en un
  toast que se va solo.
- **La baja es lógica**, no física: el contenedor desaparece de los listados y del mapa, pero la
  fila sobrevive porque su histórico de lecturas es lo que alimenta la predicción de CU-12.
- Un contenedor **sin sensor** se queda para siempre en `NORMAL` con 0% y sin fecha de última
  lectura. **Ese 0% no significa "vacío", significa "no reporta"**, y la pantalla lo distingue: el
  marcador va translúcido en el mapa y el detalle lo dice con todas las letras.

---

### CU-02 · Definir zonas y umbrales

**Actor:** Administrador · **Pantalla:** `/zonas`

Una zona agrupa contenedores y define **a partir de qué porcentaje** uno de ellos se considera
crítico. En el centro conviene 70%; en zonas de baja densidad, 85% alcanza. También define el
umbral de temperatura que dispara una alerta de incendio.

Reglas que importan:

- **Cambiar el umbral no repinta el mapa al instante.** Cada contenedor se reevalúa con su
  próxima lectura, así que si bajás el umbral de 85 a 70, los que ya deberían estar en rojo tardan
  hasta el siguiente reporte del sensor. La pantalla lo avisa.
- **No se puede borrar una zona que todavía tiene contenedores** (error `409`). El mensaje dice
  cuántos hay, que es lo accionable.
- Una **zona bloqueada** queda excluida del ruteo. Hoy se bloquea a mano; a partir del Sprint 4
  esto se va a disparar solo cuando llegue un incidente del módulo de Emergencias.
- **Recortado a propósito** (ADR-004): las zonas no tienen polígonos dibujados en el mapa. Son una
  agrupación lógica, no un área geográfica.

---

### CU-03 · Gestionar flota

**Actor:** Administrador · **Pantalla:** `/flota`

Los camiones: patente, capacidad en litros, y qué tipo de residuo puede levantar cada uno.

Reglas que importan:

- **`tipoResiduoHabilitado` no es decorativo.** Es lo que decide qué contenedores puede levantar
  ese camión cuando se genera una ruta. Un camión de RECICLABLE nunca va a aparecer para una ruta
  de ORGANICO.
- **No hay borrado, y es deliberado.** Un camión borrado seguiría colgando de las rutas históricas
  que ejecutó. Para sacarlo de circulación se lo pasa a `MANTENIMIENTO`.
- **El estado solo se puede fijar a mano en `DISPONIBLE` o `MANTENIMIENTO`.** Mandar `EN_RUTA` da
  error `400`. Ese estado lo pone la asignación de ruta (CU-09) y lo saca la última parada
  confirmada (CU-10). Permitirlo a mano abría una trampa sin salida: un camión marcado `EN_RUTA`
  sin ninguna ruta asociada quedaba trabado, porque no se le podía cambiar el estado y no había
  ninguna ruta que cerrar para liberarlo.
- La patente **se normaliza**: `"  ab 123 cd  "` se guarda como `"AB123CD"`, y la detección de
  duplicados es sobre la patente normalizada.

---

### CU-04 · Reportar nivel de llenado

**Actor:** el sensor (un aparato, no una persona) · **Sin pantalla**

Es la puerta de entrada de los datos. Los sensores mandan nivel de llenado, temperatura y batería.
Cada una de estas lecturas es lo que hace que el mapa cambie de color.

- Se autentica con un header `X-Sensor-Key`, **no con JWT**: un sensor es un dispositivo, no una
  persona con sesión.
- **No tiene pantalla y no la va a tener.** El frontend nunca llama a este endpoint. Está
  documentado para entender de dónde salen los datos que se ven cambiar.
- El simulador de `simulator/` es lo que hace este papel en desarrollo y en la demo.

---

### CU-05 y CU-06 · Detectar contenedor crítico y riesgo de incendio

**Actor:** el sistema los genera, el Operador los atiende · **Pantalla:** `/alertas`

Son dos casos de uso y una sola pantalla porque las dos alertas se atienden igual. CU-05 es la
saturación (el contenedor cruzó el umbral de llenado); CU-06 es el incendio (la temperatura pasó
el umbral de la zona).

Reglas que importan:

- **La alerta se genera UNA sola vez, en la transición.** Si el sensor sigue reportando 81%, 87%,
  94%, no aparecen alertas nuevas: la original queda abierta mientras el nivel sube. Sin esto, un
  contenedor saturado generaría una alerta cada 15 minutos. **Para el frontend significa que el
  estado del contenedor y la alerta son dos cosas distintas**: el mapa muestra el estado actual, el
  tablero muestra eventos que alguien tiene que atender. Un contenedor puede estar en `CRITICO` con
  su alerta ya `RESUELTA`.
- **El incendio no depende del llenado.** Se evalúa solo la temperatura, así que un contenedor al
  5% —verde en el mapa— puede tener una alerta `CRITICA` abierta. Es exactamente el caso que no se
  puede pasar por alto, y por eso los incendios salen en un bloque rojo separado arriba de la
  lista, y en el mapa se pintan con un halo aparte del color de estado.
- La máquina de estados es `ABIERTA → EN_ATENCION → RESUELTA`, **sin saltear ni volver atrás**. Los
  botones se deshabilitan según el estado en vez de dejar que el usuario se coma un error.

---

### CU-07 · Ver mapa en tiempo real

**Actor:** Operador · **Pantalla:** `/mapa`

La pantalla principal del módulo y la que se muestra en la demo. Todos los contenedores sobre el
mapa, coloreados por estado, actualizándose solos.

Reglas que importan:

- **El color sale del nivel de llenado, nada más.** Verde normal, amarillo advertencia, rojo
  crítico, gris fuera de servicio.
- **El incendio se pinta aparte**, como un halo naranja que late alrededor del marcador. Un
  contenedor puede estar verde y en llamas al mismo tiempo, y esa es justo la situación que no se
  puede pasar por alto.
- **Se refresca por polling cada 30 segundos.** No hay WebSocket: está evaluado para el Sprint 5 y
  no hay que esperarlo.
- El filtro por estado se resuelve **en el cliente, a propósito**. Si viajara al backend, la
  respuesta traería solo los del estado elegido y las otras cuatro tarjetas del resumen quedarían
  en cero, que es justo cuando dejan de servir: no podrías comparar ni saber a cuál saltar.
- El contenedor que **nunca reportó** se dibuja translúcido, para no mostrar un verde que miente.

---

### CU-08 · Generar ruta óptima

**Actor:** Operador (la calcula el sistema) · **Pantalla:** `/rutas`

Elegís un camión y el sistema arma un recorrido con los contenedores críticos que ese camión puede
levantar.

Reglas que importan:

- **La ruta nace `PROPUESTA` y el camión sigue `DISPONIBLE`.** Es una propuesta, no un compromiso.
- La heurística es **vecino más cercano desde el depósito**, respetando la capacidad del camión.
  **Recortado a propósito** (ADR-004): no es un VRP exacto, y no pretende serlo.
- Solo considera contenedores **`CRITICO` del tipo de residuo que el camión tiene habilitado**.
- **Excluye los contenedores ya comprometidos en otra ruta viva** y **las zonas bloqueadas**.
- La distancia estimada **incluye la vuelta al depósito**.

---

### CU-09 · Asignar ruta a camión y chofer

**Actor:** Operador · **Pantalla:** `/rutas/:id`

Revisar la propuesta y confirmarla. Recién ahí la ruta se vuelve real.

Reglas que importan:

- **Generar y asignar están separados a propósito.** Eso mantiene a una persona en el medio, por
  si la heurística propone algo absurdo. Quien confirma ve el recorrido en el mapa, el orden de las
  paradas y cuánto se llena el camión, todo junto, antes de apretar el botón.
- Solo se puede asignar desde `PROPUESTA`. Al confirmar, **el camión recién ahí pasa a `EN_RUTA`**.
- **El chofer se escribe a mano**, y esto es una limitación conocida, no un olvido. Ver
  [la decisión pendiente](#1-el-endpoint-de-choferes--necesita-decisión-de-equipo) más abajo.

---

### CU-10 · Confirmar vaciado

**Actor:** Chofer · **Pantalla:** `/chofer`

El chofer, parado en la vereda con el celular en la mano, marca que vació el contenedor. Por eso
esta pantalla vive **fuera del panel del operador**: una sola columna angosta, botones grandes, sin
sidebar.

Reglas que importan:

- **La identidad sale del token, no de un parámetro.** El endpoint `GET /rutas/mias` no acepta
  argumentos: si el chofer viajara por query string, cualquiera podría leer la ruta de otro
  cambiando un valor.
- **Valida que el chofer esté a menos de 100 metros del contenedor.** Si está lejos, el error dice
  a cuántos metros está, que es lo único accionable estando parado en la calle. **No hay carga
  manual de coordenadas**, a diferencia de CU-11: dejarle escribir la posición al chofer anularía
  el único control que tiene el caso de uso.
- **Un chofer solo puede confirmar paradas de su propia ruta.** Sin eso, cualquiera con un id de
  parada podía cerrar el trabajo de otro.
- La confirmación dispara un efecto en cascada: el contenedor vuelve a `NORMAL` y 0%, se cierran
  sus alertas de saturación, **la primera confirmación pasa la ruta a `EN_CURSO` y la última la
  cierra y libera el camión**. Sin eso el camión quedaría `EN_RUTA` para siempre.
- El contenedor vuelve a `NORMAL` **salvo que esté `FUERA_DE_SERVICIO`**: lo que tiene roto es el
  sensor o la tapa, no el nivel.
- **Recortado a propósito** (ADR-004): no hay soporte offline. La confirmación es online.

---

### CU-11 · Consultar contenedores cercanos

**Actor:** cualquier vecino · **Pantalla:** `/cerca`

"¿Dónde tiro esto?". El vecino comparte su ubicación y ve los contenedores más cercanos,
filtrables por tipo de residuo.

Reglas que importan:

- **Es el único endpoint del módulo que se sirve sin token**, y la pantalla vive fuera del panel:
  sin sidebar, sin login. Un operador logueado que abre esta vista **no manda su identidad**, lo
  cual está verificado.
- **No expone información operativa interna**: ni el estado, ni el nivel de llenado, ni la
  temperatura, ni las alertas. Devuelve exactamente seis campos y nada más. Hay un test del backend
  que falla si algún día se cuela un campo de más.
- **Los contenedores `FUERA_DE_SERVICIO` no aparecen.** Mandar a alguien caminando hasta un
  contenedor roto es peor que no listarlo. Ojo con la diferencia: se filtra *por* el estado, pero
  no se *expone* el estado.
- Si no hay nada en el radio devuelve una lista vacía, **no un error**. No encontrar contenedores
  cerca es un resultado válido.

---

### CU-12 · Predecir saturación de contenedor

**Actor:** Operador · **Tarjeta dentro de `/contenedores/:id`**

Estima cuántas horas faltan para que un contenedor cruce el umbral de su zona, haciendo una
regresión lineal sobre su histórico de lecturas.

**No está en el documento de la cátedra**: lo agregó ADR-004 para cubrir la dimensión de IA/ML.

Reglas que importan:

- **La confianza va al lado del número, no escondida abajo.** Una predicción con 44% de confianza
  se ve igual de segura que una con 93% si solo mostrás "se satura en 2,5 h", y sobre eso alguien
  planifica un camión. Por debajo del 50% la tarjeta lo dice con todas las letras.
- **Solo se ajusta sobre el ciclo de llenado actual.** Si la ventana de lecturas cruza un vaciado,
  la serie sube, cae a cero y vuelve a subir, y una recta sobre eso no describe nada.
- Dos situaciones que **no son fallas** y tienen su propio mensaje: cuando hay menos de 3 lecturas
  (`SIN_LECTURAS_SUFICIENTES`) y cuando el contenedor se está vaciando, así que no hay saturación
  que predecir (`TENDENCIA_NO_CRECIENTE`).

---

## Qué falta

Nada de esto es código a medio hacer. Son trámites, una decisión de equipo y pedidos de contrato.

### Bloqueante: los dos pull requests

**Hoy el trabajo está en ramas separadas y no llegó a `develop`.**

1. **Francisco tiene que abrir primero el PR de `feat/CU-12-prediccion` a `develop`.** Su rama
   tiene los 12 casos de uso del backend y todavía no está en la rama común.
2. **Después va el PR del frontend** desde `feat/CU-07-mapa-tiempo-real`. El orden importa: la rama
   del frontend está construida sobre la del backend, así que si va primero arrastra los commits de
   Francisco sin que nadie los haya revisado.

Dos detalles del proceso: **GitHub propone `main` por defecto y el destino tiene que ser
`develop`**, y **nadie mergea su propio PR**.

### 1. El endpoint de choferes — necesita decisión de equipo

**El problema:** para asignarle una ruta a un chofer (CU-09), hoy el operador **escribe el
identificador a mano** en un campo de texto. No hay una lista de la que elegir.

**Por qué:** los choferes son usuarios del módulo de identidad del Squad 2, no entidades de
Residuos. Mantener acá un padrón de choferes significaría tener una copia de sus datos que se
desincroniza con la fuente real.

**La consecuencia concreta:** el `choferId` es un string libre y **el backend no lo valida contra
ningún padrón**. Un identificador mal tipeado asigna la ruta igual, y el chofer nunca la ve. La
pantalla lo avisa explícitamente, pero avisar no es resolver.

**Hay que decidirlo con Nicolás y Adriel.** Las dos opciones son pedirle al Squad 2 un endpoint que
liste usuarios por rol, o aceptar que el operador escriba el identificador y validarlo de otra
forma.

### 2. Cuatro pedidos de contrato al backend

Ninguno bloquea la demo. Los cuatro son mejoras que hoy se sortean en la UI.

| Qué falta | Qué pasa hoy |
|---|---|
| **No se puede poner un contenedor en `FUERA_DE_SERVICIO`** | El estado existe en el modelo y el motor de reglas lo respeta, pero `PATCH /contenedores/:id` no acepta `estado` y no hay otro endpoint. En la pantalla el botón "Poner fuera de servicio" está deshabilitado a propósito. |
| **`GET /contenedores` no dice si el contenedor ya tiene sensor** | Para saberlo hay que pedir el detalle de a uno. En el listado no se puede distinguir "sin sensor" de "sensor que nunca reportó", que son cosas distintas. |
| **`GET /rutas` no trae el avance de paradas** | El listado no incluye las paradas, así que la tabla de rutas no puede mostrar "2 de 3 vaciadas" sin una llamada por fila. Hoy muestra la carga estimada en litros, que sí viene. El avance está en el detalle de cada ruta. |
| **No hay endpoint para omitir una parada** | `OMITIDA` existe en el modelo y la pantalla lo dibuja, pero nada lo produce. El caso real es el chofer que llega y no puede vaciar el contenedor porque hay un auto mal estacionado. |

### 3. Lo que depende de otros equipos

- **El login del Squad 2 llega en el Sprint 3.** Hasta entonces los tokens se generan a mano con
  `npm run token:dev`, duran 8 horas, y en desarrollo la aplicación los carga sola desde
  `VITE_DEV_TOKEN` para no tener que pegarlos.
- **El bloqueo automático de zonas** cuando llega un incidente del módulo de Emergencias es del
  Sprint 4. Hoy se bloquea a mano.

### 4. Recortes deliberados — esto NO es deuda

Están decididos y documentados en
[ADR-004](docs/adr/ADR-004-alcance-y-recortes.md). No hay que "completarlos":

- **Zonas sin polígonos** dibujados sobre el mapa. Son una agrupación lógica.
- **Ruteo por vecino más cercano**, no un VRP exacto.
- **Sin soporte offline** en la pantalla del chofer.
- **Sin WebSocket** en el mapa: polling cada 30 segundos. Evaluado para el Sprint 5 si sobra
  tiempo.

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

**El esquema sale de migraciones, no de `synchronize`.** Si tenías una base de antes de ese cambio,
`npm run migration:run` va a fallar porque las tablas ya existen sin estar registradas. En ese caso
hay que vaciar el esquema y volver a migrar.

Para llenar la pantalla con datos:

```bash
cd backend && npm run token:dev -- ADMINISTRADOR
```

```bash
cd simulator && TOKEN=<el-token> npm run seed
```

Después, `npm run saturacion` lleva un contenedor al rojo en unos segundos y `npm run incendio`
dispara una alerta crítica. Son las dos cosas que conviene poder provocar a voluntad en la demo.
