# Integración con Reclamos · auto que bloquea la bicisenda (CU-INT-02)

> **Responsable:** Francisco (backend) · **Branch:** `feat/CU-INT-02-reclamo-obstruccion`
> **Caso de uso integrador:** *"Reclamo ciudadano que desencadena una intervención urbana"*
> **Estado:** pasos 1 a 7 hechos. Falta que el Squad 1 registre `ReclamoEvaluado` en su catálogo y cerrar el contrato con Reclamos (sección 5).

Este documento separa **qué hago yo** de qué hace cada uno, para que no nos pisemos. Si algo de
acá te toca y no estás de acuerdo, avisame antes de arrancar.

> **Cambió respecto de la primera versión.** Nico conectó Residuos al bus de CityPass+ en el
> PR #52 (CU-INT-01): ya hay un webhook que recibe eventos de otros squads, con autenticación y
> deduplicación resueltas. Por eso el reclamo **ya no entra por un endpoint propio sino por ese
> webhook**, y todo vive en el módulo `integracion`. Lo que cambia para cada uno está en la
> sección 4.

---

## 1. Qué pidió el profesor

El squad de Reclamos recibe la denuncia de un ciudadano: un auto estacionado bloquea la
bicisenda. Nos manda ese reclamo y **Residuos tiene que decidir si ese auto le impide al camión
llegar a algún contenedor**. Si se lo impide, hay que **recalcular la ruta**.

El reclamo siempre es un auto, y un auto siempre bloquea. Por eso la decisión **no depende del
tipo de obstáculo, depende de dónde está**: un auto a mitad de cuadra no nos afecta, uno frente a
un contenedor sí.

## 2. El flujo

```
Reclamos ──bus──▶ POST /webhooks/citypass   (ya existe, CU-INT-01)
                  com.citypass.reclamos.<ReclamoCreado>  { reclamoId, latitud, longitud }
                    1. contenedores a ≤ 15 m del auto
                    2. si no hay ninguno → no nos afecta
                    3. si hay → bloquearlos y recalcular las rutas vivas que los tengan
                    4. publicamos residuos.reclamo.evaluado  → Reclamos se entera del resultado

<otro squad> ──bus──▶ <aviso de que el auto ya no está>  { reclamoId }
                    5. se levanta el bloqueo
```

**Residuos no resuelve el reclamo.** Lo resuelve otro squad (Emergencias, Tránsito o quien
corresponda; todavía no se sabe) y avisa por el bus que el auto ya no está. Nosotros solo
reaccionamos a ese aviso.

Los nombres entre `< >` todavía no están definidos (sección 5). Mientras tanto, el backend acepta
las variantes razonables (sección 3.3).

Si Reclamos nunca avisa que se resolvió, el bloqueo **vence solo** a las 4 horas (configurable).
Así un contenedor no queda afuera del ruteo para siempre por un aviso que no llegó.

## 3. Lo que hago yo

Todo en `backend/src/modules/integracion/`, al lado de los refuerzos y bloqueos de Nico, siguiendo
el mismo patrón.

### 3.1 Tabla, migración y repositorio — ✅ hecho

Tabla `obstruccion_por_reclamo`, **una fila por contenedor afectado**:

| Campo | Para qué |
|---|---|
| `reclamoId` | El id del reclamo. Único junto con `contenedorId` |
| `contenedorId` | El contenedor tapado (FK, se borra en cascada con el contenedor) |
| `distanciaMetros` | A cuánto del contenedor estaba el auto |
| `creadaEn`, `venceEn` | Vencimiento automático |
| `resueltaEn` | Cuando Reclamos avisa que se resolvió |

Un contenedor **está obstruido si tiene alguna fila sin `resueltaEn` y con `venceEn` en el
futuro**. El vencimiento se evalúa en la consulta: no hace falta un cron. Es una tabla y no un
booleano en `contenedor` porque dos reclamos pueden tapar el mismo contenedor, y resolver uno no
tiene que destaparlo.

El repositorio es una interfaz aparte, `ObstruccionRepository` (token `OBSTRUCCION_REPOSITORY`),
implementada por el mismo `IntegracionTypeormRepository`. Va aparte para no tocar el mock de
`IntegracionRepository` que usan los tests de Nico.

Archivos: `domain/obstruccion-por-reclamo.entity.ts`, `domain/integracion.repository.ts`,
`infrastructure/integracion.typeorm.repository.ts`, `integracion.module.ts`,
`migrations/1792540800000-ObstruccionPorReclamo.ts` y el e2e `test/obstruccion.e2e-spec.ts`.

### 3.2 Excluir del ruteo — ✅ hecho

En `RutasService.buscarCandidatos` agrego un filtro más: se descartan los contenedores
obstruidos. Va inyectado igual que `REFUERZOS_VIGENTES`, que `rutas` ya recibe de `integracion`.
Un contenedor tapado queda afuera **aunque esté reforzado por un evento cultural**: el camión no
puede llegar igual.

### 3.3 Recibir el reclamo — ✅ hecho

`ReclamosService` (en `integracion/application/`) y la lectura tolerante del contrato en
`integracion/domain/reglas/contrato-reclamos.ts`. `IntegracionService.procesar` lo llama desde el
`default` del switch: si no es un reclamo útil, el evento queda `ignorado` como antes.

Dos reacciones nuevas en `IntegracionService.procesar`:

- **Reclamo creado:** busca los contenedores activos a `≤ OBSTRUCCION_RADIO_METROS`, guarda una
  fila por cada uno, recalcula las rutas (3.4) y publica el resultado (3.5).
- **Aviso de resolución:** `resolverReclamo(reclamoId)`. El contenedor sigue `CRITICO`, así que
  entra solo en la próxima ruta que se genere. No reabre paradas omitidas, por el mismo motivo
  documentado en `paradas.service.ts`: una parada cerrada no se reabre.

La deduplicación por `eventId` y la transacción ya las hace `procesar`. Si el mismo reclamo
llega con otro `eventId`, la tabla lo ignora por la clave única.

#### Mientras no haya contrato: aceptar lo razonable

Ni el evento de entrada ni el de resolución están definidos, y no sabemos qué squad manda el
segundo. Hasta que se definan, el backend **acepta las variantes lógicas** en vez de exigir un
formato que nadie acordó:

| Qué | Se acepta |
|---|---|
| Tipo del reclamo creado | `com.citypass.reclamos.` + `ReclamoCreado`, `ReclamoRegistrado` o `ReclamoPublicado` |
| Tipo del aviso de resolución | Cualquier squad (no se mira el prefijo) + `ReclamoResuelto`, `ReclamoCerrado`, `IntervencionFinalizada`, `ObstruccionResuelta` u `ObstruccionLiberada`. También un `ReclamoActualizado` con `estado`/`estadoNuevo` en `RESUELTO`, `CERRADO` o `FINALIZADO` |
| Id del reclamo | `reclamoId`, `idReclamo` o `id` |
| Ubicación | `latitud`/`longitud` (como Emergencias), `lat`/`lng`, o un objeto `ubicacion` con cualquiera de los dos pares |
| Categoría | Opcional. Si viene y no es de estacionamiento indebido, se ignora. Si no viene, se procesa |

Reglas de la tolerancia:

- **Un evento que no se puede usar se ignora y se loguea, no se rechaza.** Si responde `400`, el
  dispatcher del Squad 1 lo reintenta para siempre aunque no haya nada que corregir de nuestro
  lado.
- **Un aviso de resolución de un reclamo que no conocemos no hace nada.** Puede ser de un reclamo
  que no tapaba ningún contenedor.
- Las listas viven en constantes en un solo lugar y llevan un comentario `ponytail:`. Cuando se
  cierre el contrato, se recortan a los nombres reales.
- Si el aviso no llega nunca, el vencimiento automático cubre el caso.

### 3.4 Recalcular la ruta viva — ✅ hecho

`ParadasService.quitarContenedores(contenedorIds, motivo, reclamoId?)`. Devuelve las rutas que
cambiaron. Para cada ruta viva que tenga como pendiente un contenedor afectado:

| Estado de la ruta | Qué pasa |
|---|---|
| `PROPUESTA` | Se borra la parada y se reordenan las restantes desde el depósito. Si no le queda ninguna, la propuesta pasa a `CANCELADA` |
| `ASIGNADA` / `EN_CURSO` | La parada pasa a `OMITIDA` con el motivo del reclamo. Las pendientes se reordenan saliendo desde el último contenedor **confirmado** (o desde el depósito si no hay ninguno) |
| `COMPLETADA` / `CANCELADA` | No se toca |

- El contenedor **no se toca**: sigue lleno, en `CRITICO` y con su alerta abierta.
- Si la omitida era la última pendiente, la ruta se cierra y el camión se libera (`avanzarRuta`).
- Se actualiza `distanciaEstimadaKm` con el recorrido completo: depósito, confirmadas, pendientes
  reordenadas y vuelta. `litrosEstimados` no se toca.
- Las paradas omitidas **no cuentan como visitadas** al elegir desde dónde reordenar: no se sabe
  si el camión llegó (las omitió el chofer) o si nunca fue (las omitió el sistema).
- El reordenamiento es la función pura `reordenarPendientes` de `planificador.ts`, con la misma
  heurística que generar.
- Va en `ParadasService` y no en `RutasService` para no cambiar el constructor de este último, que
  tiene parámetros opcionales posicionales y se usa en muchos tests. Se suma a la transacción en
  curso, como `omitirPorSistema`.
- ✅ **Omisión por sistema:** `ParadasService.omitirPorSistema(paradaId, motivo)`. Comparte el
  núcleo con la omisión del chofer (marcar `OMITIDA` + `avanzarRuta` + evento), sin exigir sesión.
  **Se suma a la transacción en curso** si la hay, para quedar atómica con la obstrucción que
  guarda quien la llama; si no hay ninguna, abre una propia. El endpoint del chofer quedó igual.
- **Dependencia circular a resolver en el paso 5:** `rutas` ya importa `integracion` (por los
  refuerzos y las obstrucciones), y `integracion` va a tener que llamar a
  `ParadasService.quitarContenedores`. La opción más chica es `forwardRef` en los dos módulos.

### 3.5 Eventos que publicamos

- **`residuos.reclamo.evaluado`** (nuevo): la respuesta a Reclamos. El webhook responde `204`
  sin cuerpo, así que el resultado tiene que volver por el bus.

  ```json
  {
    "reclamoId": "RC-123",
    "afectaRecoleccion": true,
    "contenedoresAfectados": [{ "codigo": "CT-0421", "distanciaMetros": 8.4 }],
    "rutasRecalculadas": ["b1f0..."]
  }
  ```

  Con `afectaRecoleccion: false` también se publica: es la respuesta normal del caso "el auto no
  nos molesta".

- **`residuos.ruta.recalculada`** (nuevo, ✅): para el front del chofer y el operador.

  ```json
  {
    "rutaId": "b1f0...",
    "camionId": "AB123CD",
    "estado": "EN_CURSO",
    "motivo": "Acceso bloqueado por vehículo (reclamo RC-123)",
    "reclamoId": "RC-123",
    "paradasQuitadas": ["CT-0421"],
    "paradasPendientes": 2,
    "distanciaEstimadaKm": 12.3,
    "recalculadaEn": "2026-10-21T18:00:00.000Z"
  }
  ```
- **`residuos.parada.omitida`** (ya existe): por cada parada omitida en una ruta en curso. Lo
  consume Analítica (Squad 8), así que las omisiones por reclamo entran en sus métricas.

Los tres pasan por el outbox, pero **solo sale al bus lo que traduce `traducirAGateway`**
(`shared/events/gateway/traductor-gateway.ts`); el resto queda dentro del módulo:

| Evento | ¿Sale al bus? |
|---|---|
| `residuos.reclamo.evaluado` | ✅ Sí, como `com.citypass.residuos.ReclamoEvaluado` |
| `residuos.ruta.recalculada` | No: lo usa solo nuestro front, por la API |
| `residuos.parada.omitida` | No (ya era así antes de este caso) |

**Pendiente del Squad 1:** registrar `ReclamoEvaluado` en el catálogo del gateway. Mientras no
esté, el gateway responde 404 y el evento queda `FALLIDO` en el outbox, sin romper nada más.

### 3.6 Configuración

| Variable | Default | Qué es |
|---|---|---|
| `OBSTRUCCION_RADIO_METROS` | `15` | Distancia máxima entre el auto y el contenedor para considerarlo tapado |
| `OBSTRUCCION_VIGENCIA_HORAS` | `4` | Cuánto dura el bloqueo si Reclamos no avisa |

**No se reutiliza `INTEGRACION_RADIO_METROS`** (300 m, de Nico): sirve para "contenedores cerca
de un evento", no para "contenedor tapado por un auto".

**Por qué 15 m:** es el largo de un auto más el espacio que necesita el camión para maniobrar
frente al contenedor.

### 3.7 Tests

- ✅ **e2e del repositorio** (`test/obstruccion.e2e-spec.ts`): vigente, vencida, resolver,
  reclamo repetido y dos reclamos sobre el mismo contenedor.
- **Unitarios** en `integracion.service.spec.ts`: sin contenedores en el radio → no afecta; con
  contenedor en ruta `EN_CURSO` → parada `OMITIDA` y ruta reordenada.
- **e2e por el webhook**, como `test/integracion.e2e-spec.ts`: crítico → ruta asignada → reclamo
  frente al contenedor → parada omitida y ruta recalculada → resuelto → el contenedor vuelve a
  entrar en una ruta nueva.

### 3.8 Documentación

- `docs/arquitectura/contratos-de-eventos.md`: los eventos de Reclamos que consumimos y los dos
  nuevos que publicamos.
- `docs/arquitectura/guia-frontend.md`: el evento `residuos.ruta.recalculada` y el motivo de la
  parada omitida.
- `ESTADO.md`: el caso de uso como implementado, cuando lo esté.

---

## 4. Lo que **no** hago yo

| Tema | Responsable | Qué necesito |
|---|---|---|
| **Autenticación** | — | Ya no hace falta nada nuevo: el webhook de Nico autentica con `GATEWAY_WEBHOOK_TOKEN`. **Adri**, si podés, revisá que sumar un tipo de evento más no cambie nada de tu lado |
| **Front del chofer y del operador**: mostrar que la ruta cambió, el motivo de la parada omitida y qué contenedores están bloqueados | **Maxi** | Nada de mi lado más allá del evento del 3.5. Si necesita `bloqueado: true` en la respuesta de contenedores, me avisa y lo agrego |
| **Variables nuevas en Render** | **Ramiro** | Cargar `OBSTRUCCION_RADIO_METROS` y `OBSTRUCCION_VIGENCIA_HORAS` cuando esté el paso 3.3. La migración corre en el deploy como las demás |
| **Suscripción en el bus** a los eventos de Reclamos | **Nico** (armó la integración con el Squad 1) | Agregar los tipos de Reclamos a la suscripción del webhook |
| **Contrato con el squad de Reclamos** y con el que resuelva el reclamo | **Nico / Tomi** (o quien vaya a la reunión) | Que confirmen los puntos de la sección 5 |
| **Resolver el reclamo** (sacar el auto) | Otro squad, a definir | Que avise por el bus con el `reclamoId` |

### Archivos que voy a tocar

- `backend/src/modules/integracion/**` (Nico: los cambios son aditivos, no toco la lógica de
  refuerzos ni de emergencias)
- `backend/src/modules/rutas/application/rutas.service.ts` (`buscarCandidatos`) y
  `paradas.service.ts` (el refactor de `omitir`)
- `backend/src/shared/domain/domain-event.ts` (`EventTypes`)
- `backend/.env.example` (no `env.validation.ts`: las reglas de negocio no se validan ahí)
- `backend/src/shared/events/gateway/traductor-gateway.ts` (un `case` para `ReclamoEvaluado`)
- `backend/src/migrations/` (una migración nueva)
- `backend/test/helpers/app-de-prueba.ts` (la tabla nueva en el `TRUNCATE`)
- Tests nuevos y los docs del punto 3.8

**No toco:** `backend/src/shared/auth/**`, `backend/src/shared/events/gateway/**`, `frontend/**`,
`infra/**` ni `render.yaml`.

---

## 5. Qué hay que cerrar con el squad de Reclamos

**Actualizado el 22/10 con el contrato de eventos que mandó Reclamos (Grupo 5):**

| Tema | Lo que dijo Reclamos | Cómo quedó |
|---|---|---|
| Evento de alta | `com.citypass.reclamos.ReclamoCreado`, con `reclamoId`, `latitud`, `longitud` | ✅ Coincide |
| Categoría | `TRANSITO` (también abarca otros problemas de tránsito) | ✅ Se acepta `TRANSITO` si el título o la descripción hablan de un vehículo |
| Quién avisa la resolución | **Reclamos mismo**, en `ReclamoActualizado` con `estadoNuevo: RESUELTO` | ✅ Coincide. También se liberan los reclamos rechazados o cancelados |
| Reclamos de `RESIDUOS` | Los abren ellos con nuestras alertas de saturación, en la ubicación del contenedor | ✅ Se ignoran: tomarlos como un auto bloquearía el contenedor que hay que vaciar |
| `ReclamoEvaluado` | No figura entre lo que consumen | Lo consume BI para la métrica. Si Reclamos lo quiere, ya está publicado |

Sigue pendiente:
1. **Grupo 1:** registrar `ReclamoEvaluado` en el catálogo y suscribir nuestro webhook a
   `ReclamoCreado` y `ReclamoActualizado`.
2. **Avisarles a Reclamos** que Espacios publica `ActividadCreada`, no `EventoComunitarioPublicado`
   (que es lo que ellos dicen consumir). Es un tema de Maxi y Tomás, pero conviene que se enteren.
---

## 6. Orden de trabajo

| # | Tarea | Estado | Depende de |
|---|---|---|---|
| 1 | Tabla, migración y repositorio de `obstruccion_por_reclamo` | ✅ | — |
| 2 | Excluir obstruidos en `buscarCandidatos` + test | ✅ | 1 |
| 3 | Refactor de `omitir` para que lo pueda llamar el sistema | ✅ | — |
| 4 | Recalcular rutas vivas + `residuos.ruta.recalculada` + tests | ✅ | 1, 3 |
| 5 | Recibir el reclamo y el aviso de resolución + `residuos.reclamo.evaluado` | ✅ | 1, 4 |
| 6 | e2e completo por el webhook | ✅ | 5 |
| 7 | Docs | ✅ | 5 |

Del paso 1 al 6 no dependo de nadie. Si el contrato con Reclamos cambia, lo único que se ajusta es
la lectura del evento en el paso 5.
