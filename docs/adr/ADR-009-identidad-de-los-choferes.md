# ADR-009 — Identidad de los choferes

- **Estado:** Aceptado
- **Fecha:** 2026-09-06
- **Decisores:** Squad 4, con criterio de cátedra
- **Supersede parcialmente:** [ADR-005](ADR-005-seguridad-identidad.md), en lo que asume que los
  choferes son usuarios del módulo de identidad del Squad 2

## Contexto

CU-09 asigna una ruta a un chofer. Durante los Sprints 1 y 2 se asumió que los choferes eran
**usuarios del módulo de identidad del Squad 2**, igual que administradores y operadores. De ese
supuesto salieron dos decisiones:

- `Ruta.choferId` era un `varchar` con el `sub` del JWT, **no una clave foránea**. Mantener un
  padrón propio de choferes se descartó explícitamente: habría sido una copia de datos ajenos,
  condenada a desincronizarse.
- No se implementó `GET /choferes`, porque el Squad 2 no expone un endpoint para listar usuarios
  por rol, y su propia guía dice que cada módulo conoce a las personas *a medida que van entrando*.

El costo de ese diseño resultó ser concreto y no teórico: **el operador escribía el identificador a
mano y nadie lo validaba**. Un identificador mal tipeado asignaba la ruta con `200`, y el chofer no
la veía nunca. Su pantalla quedaba vacía **sin ningún error**, indistinguible de "todavía no me
asignaron nada". Quedó registrado como la trampa número uno del
[guion de la demo](../sprints/guion-demo-hito-1.md).

Cuando el equipo llevó el problema a discusión, la cátedra resolvió el supuesto de raíz: **los
choferes se manejan como una lista interna del módulo. No se registran ni inician sesión contra el
Squad 2.**

Eso no elige entre las alternativas que se estaban discutiendo — las invalida a las dos.

## Opciones consideradas

### A. Pedirle al Squad 2 un endpoint que liste usuarios por rol

- **A favor:** una sola fuente de verdad para las personas de toda la plataforma.
- **En contra:** no existe hoy, y su propia guía dice que no está previsto. Depende de que otro
  equipo lo priorice, y su login federado recién llega en el Sprint 3. Y, tras el criterio de
  cátedra, resuelve un problema que ya no tenemos.

### B. Aceptar texto libre y validarlo contra los identificadores ya vistos

Guardar el `sub` de cada chofer que entra, y validar la asignación contra esa lista.

- **A favor:** no depende de nadie. Es lo que el propio Squad 2 recomienda para conocer personas.
- **En contra:** un chofer que nunca entró no existe, y no se le puede asignar una ruta — pero
  asignar una ruta *antes* del turno es justamente el caso normal. La lista solo crece: nada indica
  que alguien dejó de ser chofer. Sigue siendo una copia de datos ajenos, solo que poblada sola.

### C. El chofer como entidad de este módulo

Una tabla `chofer` con nombre, legajo y baja lógica, igual que zonas o flota. `Ruta.choferId` pasa a
ser una clave foránea de verdad.

- **A favor:** el operador elige de una lista en vez de escribir. La asignación se valida, así que
  la falla silenciosa desaparece. Las rutas pueden mostrar el **nombre** del chofer, que es lo que
  el operador necesita leer, y no un identificador opaco. No depende de otro equipo.
- **En contra:** hay que resolver cómo entra el chofer a la pantalla de CU-10, porque sin login
  federado no hay sesión que venga de afuera.

## Decisión

**Se adopta la opción C.**

1. **`chofer` es una entidad de este módulo**, con `nombre`, `legajo` único y baja lógica. Nunca se
   borra: sus rutas históricas lo referencian, y son el registro de quién ejecutó cada recolección.

2. **`Ruta.choferId` es una clave foránea.** La asignación valida: `404 CHOFER_NO_ENCONTRADO` si no
   existe, `409 CHOFER_INACTIVO` si está dado de baja, `400` si no es un uuid. Las rutas devuelven
   el chofer expandido, en el detalle y en el listado.

3. **`chofer.usuarioSub` une a la persona con su sesión.** `GET /rutas/mias` resuelve por ahí. Es
   nullable a propósito: un chofer puede existir en la operación antes de que le configuren el
   acceso, y en ese caso se le pueden asignar rutas igual, aunque todavía no vea la suya.

4. **La baja lógica es el mecanismo de revocación.** Sin login no hay sesión que cerrar ni
   contraseña que cambiar. La consulta que resuelve el chofer desde la sesión filtra por `activo` en
   **cada request**, así que dar de baja a alguien le corta el acceso en el request siguiente. Por
   eso el método se llama `buscarActivoPorUsuarioSub`: el filtro es parte del contrato, no un
   detalle de implementación.

5. **El token del chofer lleva un `token_use` propio**, no el `human` del contrato del Squad 2.
   `human` significa, en ese contrato, *persona autenticada por ellos con un `sub` de ellos*.
   Reusarlo para una identidad que inventamos nosotros contamina exactamente el campo que existe
   para trazar quién hizo qué: alguien mirando ese `sub` en un evento
   `residuos.contenedor.vaciado` dentro de dos meses no tendría cómo saber que no es del Squad 2.

## Consecuencias

**Se cierra la falla silenciosa**, que era el motivo real del cambio. Lo que antes asignaba con
`200` ahora falla con `400` o `404`.

**El operador lee nombres.** `GET /choferes` alimenta un `<select>`; las rutas traen `chofer`
expandido. Desaparece el uuid de la pantalla.

**Rompe el contrato de asignación.** La pantalla de detalle de ruta enviaba texto libre y ahora debe
enviar un uuid. El frontend y el backend tienen que entrar juntos: el CI no lo detectaría, porque
lo que se rompe es el frontend contra el backend nuevo y no hay ningún test que cruce esa frontera.

**El chofer sigue autenticando**, aunque no contra el Squad 2. La decisión de la cátedra elimina el
registro y el login federado, **no el control de acceso**: `/rutas/mias` y la confirmación de
paradas siguen resolviendo la identidad desde el token y nunca desde un parámetro. Un chofer no
puede leer ni cerrar la ruta de otro.

**Queda deuda con el Sprint 3.** Si el Squad 2 llegara a exponer un padrón de usuarios, esta tabla
puede pasar a ser una proyección de aquel en vez de la fuente. Nada del modelo lo impide:
`usuarioSub` ya es el punto de unión.

### Acciones abiertas

**Ninguna. Las cuatro se cerraron entre el 08/09 y el 11/09.**

| Acción | Responsable | Cómo se cerró |
|---|---|---|
| Aceptar `token_use: "chofer-interno"` en el guard. **Va antes que el emisor**: un `if` que acepta un valor que nadie emite todavía no rompe nada; un emisor que emite un valor que el guard rechaza rompe todos los ingresos de chofer | Adriel | PR #15. Se respetó el orden |
| Emitir ese `token_use`, una vez que el guard lo acepte | Francisco | PR #13, después del #15 |
| Decidir si el token del chofer lleva un `iss` propio | Adriel / Francisco | Sí, lo lleva: `JWT_ISSUER_CHOFERES`, y el guard lo cruza contra el `token_use`. Un `iss` prestado del Squad 2 habría sido una mentira permanente por diseño, no temporal como la de los tokens de desarrollo |
| Definir cómo se le entrega el token al chofer | Squad 4 | Como se proponía: `POST /choferes/:id/credencial`, se muestra una sola vez, se emite de nuevo si se pierde |

### Lo que se aprendió emitiendo la credencial

Dos cosas que no estaban en la decisión original y salieron al implementarla:

**La revocación es por rotación del `usuarioSub`, y eso era lo que faltaba.** El backend no guarda
la credencial: un JWT se valida por firma, así que no hay nada que recordar ni que hashear. Lo que
sí guarda es `chofer.usuarioSub`, y el guard resuelve al chofer por ahí. Emitir una credencial
nueva genera un `sub` nuevo y **mata todas las anteriores en el acto**, aunque su firma siga siendo
válida y falte un mes para que venzan.

Eso resuelve la tensión que había quedado abierta: una credencial corta deja al chofer tildado en
la calle a mitad de turno, y una larga sin forma de revocarla es peor. Con la rotación se puede
tener las dos cosas — dura 30 días y se corta cuando haga falta. Y quedan dos niveles distintos:
perder el celular se arregla emitiendo otra credencial, sin sacar al chofer de circulación; que la
persona deje de trabajar se arregla dándola de baja.

**Dar de baja a un chofer con una ruta activa dejaba el camión varado.** El chofer perdía el acceso
en el acto, así que no podía cerrar las paradas; la ruta no cerraba; el camión quedaba `EN_RUTA`
para siempre; y CU-03 no deja cambiarle el estado a mano a un camión en ruta. La baja ahora falla
con `409 CHOFER_CON_RUTA_ACTIVA`: primero se cierra o se reasigna la ruta.

### Queda sin efecto de ADR-005

- La acción abierta de confirmarle al delegado del Squad 2 el nombre del grupo `chofer`. Ese grupo
  ya no interviene: el rol del chofer no sale de los grupos de su IdP.
- La afirmación de que una referencia a un chofer guarda el `sub` del Squad 2. Guarda el id de un
  chofer nuestro; el `sub` queda como el vínculo con su sesión, no como su identidad.

Lo demás de ADR-005 sigue vigente sin cambios: administradores, operadores y ciudadanos no se ven
afectados, y los sensores tampoco — nunca estuvieron dentro del contrato de identidad.
