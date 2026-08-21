# ADR-007 — Design system, navegación y capa de datos falsos en el frontend

- **Estado:** Aceptado
- **Fecha:** 2026-08-21
- **Decisores:** Máximo Trufelman (responsable de frontend)

## Contexto

Al cierre del Sprint 1 el frontend tenía **una sola pantalla** —el mapa de CU-07— con estilos
improvisados (`--acento: #2563eb`, `system-ui`) que no seguían ningún sistema visual.

El Sprint 2 suma tres pantallas más: el ABM de contenedores (CU-01), el de zonas (CU-02) y el
tablero de alertas (CU-05/CU-06). Son las cuatro que el Hito 1 del 24/09 evalúa funcionando, y la
dimensión 9 de la rúbrica (UX/UI) vale 10 puntos.

Tres restricciones nuevas:

1. **Existe un design system de CityPass+** con paleta, tipografías, iconografía y estados
   definidos. Bajarlo a código después de escribir la cuarta pantalla significa aplicarlo mal en
   las tres primeras.
2. **Cuatro pantallas ya no entran en una sola vista.** [ADR-006](ADR-006-stack-frontend.md) dejó
   el router explícitamente pendiente: *"con una sola pantalla no se justifica; se reevalúa en el
   Sprint 2, cuando entren las pantallas de ABM"*. Es ese momento.
3. **Se diseña antes de conectar.** Los endpoints de CU-01, CU-02 y las alertas existen y andan,
   así que maquetar es un paso extra. Se hace igual, para fijar el sistema visual con las cuatro
   pantallas a la vista en vez de descubrirlo pantalla por pantalla.

## Decisión

### 1. El design system vive en un único archivo de tokens

`src/estilos/tokens.css` define la paleta, la escala tipográfica, el espaciado, los radios y las
sombras como custom properties. **Ningún componente escribe un hexadecimal a mano.**

Los colores de estado de contenedor en `src/dominio/estados.js` se realinean a la paleta: Verde
Urbano `#4F8A72` (NORMAL), Ámbar `#D99838` (ADVERTENCIA), Rojo Emergencia `#C83E4D` (CRÍTICO),
Gris Medio `#68717D` (FUERA_DE_SERVICIO).

Sobre los tokens se construye `src/componentes/ui/`: `Boton`, `Campo`, `Modal`, `Tabla`, `Chip`,
`Aviso` y `BarraLlenado`. Las cuatro pantallas se arman con esas siete piezas.

### 2. Router y shell compartido

`react-router-dom` con cinco rutas (`/mapa`, `/contenedores`, `/contenedores/:id`, `/zonas`,
`/alertas`). `App.jsx` deja de ser la pantalla del mapa y pasa a ser router más shell.

El shell muestra el sidebar completo de la plataforma CityPass+. **Los módulos de otros squads
aparecen deshabilitados, no ocultos:** dejan ver dónde encaja Residuos dentro de la plataforma sin
prometer funcionalidad que no existe.

### 3. Los datos falsos van detrás de `api/residuos.js`, no adentro de los componentes

- `api/residuos.http.js` — las llamadas reales.
- `mocks/servidor.js` — un servidor en memoria con las **mismas firmas y las mismas formas**.
- `api/residuos.js` — elige entre los dos según `VITE_USAR_MOCKS`.

Ninguna pantalla importa de `residuos.http.js` ni de `mocks/`. Es la extensión del principio que
ADR-006 ya fijó para el token: *"toda llamada a la API pasa por `src/api/cliente.js`"*.

Dos reglas hacen que el mock sirva para algo:

- **Muta el store.** Dar de alta un contenedor lo agrega a la tabla; resolver una alerta la mueve
  de estado. Un mock que siempre devuelve lo mismo deja sin diseñar lo que pasa *después* de la
  acción, que es la mitad de cada pantalla.
- **Falla como falla el backend**, con `ErrorApi` y los mismos `code` estables
  (`ZONA_CON_CONTENEDORES`, `CONTENEDOR_YA_TIENE_SENSOR`, `ALERTA_NO_ABIERTA`, `HTTP_400` con
  `message` como array). Si el mock siempre dijera que sí, las pantallas de error se diseñarían
  contra un backend imaginario.

Los fixtures cubren a propósito los casos difíciles: un contenedor `FUERA_DE_SERVICIO`, uno **sin
sensor** (que no es lo mismo que uno vacío), uno **verde con un incendio abierto**, un sensor con
la batería al 12%, una zona bloqueada y una zona sin contenedores.

## Consecuencias

- **Conectar al backend es apagar una variable de entorno**, no reescribir pantallas. Cuando las
  cuatro estén conectadas se borra `mocks/`, se borra la variable, y `residuos.js` vuelve a ser un
  re-export de `residuos.http.js`.
- **`mocks/` queda fuera del cómputo de cobertura.** Es andamiaje con fecha de vencimiento;
  exigirle tests sería pagar por código que no llega a producción. El umbral del 60% se sostiene
  con tests de la lógica real: la máquina de estados de las alertas, el desarmado del `HTTP_400`
  por campo, el modal de la API key y los conflictos de negocio.
- **Dos límites del backend quedan visibles en la UI en lugar de disimulados.** El botón "Poner
  fuera de servicio" se muestra deshabilitado con su motivo, porque `PATCH /contenedores/:id` no
  acepta `estado`; y el listado no puede saber si un contenedor ya tiene sensor, así que deja
  intentar y muestra el `409`. Ambos son pedidos de contrato pendientes.
- **El mapa deja de ser la aplicación entera** y pasa a ser una pantalla más. Su lógica
  (`useMapaEnVivo`, `MapaContenedores`, `PanelContenedor`) no cambió.
