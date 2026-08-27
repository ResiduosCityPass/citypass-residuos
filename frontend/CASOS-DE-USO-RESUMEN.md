# Casos de uso — resumen

Los 12 casos de uso del módulo, con el tipo de operación de cada uno y el estado en el frontend.
Versión corta de [CASOS-DE-USO.md](CASOS-DE-USO.md), que tiene el detalle completo.

Fuentes: el documento de casos de uso de la cátedra (CU-01 a CU-11),
[ADR-004](../docs/adr/ADR-004-alcance-y-recortes.md) (recortes y el agregado de CU-12) y el
[backlog priorizado](../docs/sprints/backlog-priorizado.md).

Actualizado al **2026-08-21**.

---

## Leyenda de tipos

| Tipo | Qué significa |
|---|---|
| **CRUD** | Alta, listado, edición y baja completos |
| **CRU** | Sin baja (falta el `DELETE` a propósito) |
| **R** | Solo lectura |
| **Acción** | Un `PATCH`/`POST` puntual que cambia estado, no un ABM |
| **Regla** | Lógica del backend, sin pantalla propia |

---

## Los 12 casos de uso

| CU | Nombre | Tipo | Actor | Endpoints | Pantalla | Estado |
|---|---|---|---|---|---|---|
| 01 | Registrar contenedor y sensor | **CRUD + Acción** | Admin | `GET/POST/PATCH/DELETE /contenedores` · `POST /:id/sensor` | `/contenedores` + `/contenedores/:id` | Hecho |
| 02 | Definir zonas y umbrales | **CRUD + Acción** | Admin | `GET/POST/PATCH/DELETE /zonas` · `PATCH /zonas/:id/bloqueo?bloqueada=` | `/zonas` | Hecho |
| 03 | Gestionar flota | **CRU** (sin baja) | Admin | `GET/POST/PATCH /camiones` | `/flota` | Hecho |
| 04 | Reportar nivel de llenado | **Create** (ingesta) | Sensor | `POST /lecturas` (`X-Sensor-Key`, sin JWT) | — | No aplica |
| 05 | Detectar contenedor crítico | **Regla** → en front **R + 2 Acciones** | Sistema | `GET /alertas` · `PATCH /:id/atender` · `PATCH /:id/resolver` | `/alertas` | Hecho |
| 06 | Detectar riesgo de incendio | **Regla** → en front **R + 2 Acciones** | Sistema | mismos que CU-05 (`?tipo=INCENDIO`) | `/alertas` | Hecho |
| 07 | Ver mapa en tiempo real | **R** (polling 30 s) | Operador | `GET /mapa/contenedores` + `GET /alertas?tipo=INCENDIO&estado=ABIERTA` | `/mapa` | Hecho |
| 08 | Generar ruta óptima | **R + Create** | Sistema | `GET /rutas` · `POST /rutas/generar` | `/rutas` | Hecho |
| 09 | Asignar ruta a camión y chofer | **R + Acción** | Operador | `GET /rutas/:id` · `PATCH /rutas/:id/asignar` | `/rutas/:id` | Hecho |
| 10 | Confirmar vaciado | **R + Acción** | Chofer | `GET /rutas/mias` · `PATCH /paradas/:id/confirmar` `{lat,lng}` | `/chofer` | Hecho |
| 11 | Consultar contenedores cercanos | **R** (público, sin token) | Ciudadano | `GET /publico/contenedores/cercanos?lat=&lng=&radioMetros=&tipoResiduo=` | `/cerca` | Hecho |
| 12 | Predecir saturación | **R** (calculado) | Sistema | `GET /contenedores/:id/prediccion` *(endpoint no existe aún)* | tarjeta en `/contenedores/:id` | Hecho |

**11 diseñados · 1 no aplica (CU-04, lo llaman los sensores).** Ninguna pantalla está conectada al
backend: todo corre contra [`src/mocks/`](src/mocks).

Nueve viven adentro del panel del operador. `/cerca` y `/chofer` corren **fuera del Shell**: son
otros actores, no otra sección del panel.

---

## Reglas clave, una por línea

| CU | Lo que no se puede pasar por alto |
|---|---|
| 01 | `codigo` opcional en alta y **no editable** en `PATCH` · **la API key se muestra una sola vez** · la baja es **lógica** · sin sensor, el 0% no significa "vacío" |
| 02 | **Recortado: sin polígonos** (ADR-004) · bajar el umbral no repinta el mapa al instante · no se borra una zona con contenedores (`409`) · zona bloqueada sale del ruteo |
| 03 | Sin borrado (rutas históricas) → se pasa a `MANTENIMIENTO` · nace `DISPONIBLE` · un camión `EN_RUTA` no cambia de estado a mano · `tipoResiduoHabilitado` filtra en CU-08 |
| 04 | Lo llama el dispositivo, no una persona. Nada que diseñar |
| 05 / 06 | `ABIERTA → EN_ATENCION → RESUELTA`, sin saltear ni volver atrás · incendios en bloque rojo aparte, arriba · **la alerta se genera una sola vez, en la transición** · el código del contenedor se cruza en el cliente |
| 07 | Refresco cada 30 s, sin WebSocket · **el incendio se pinta aparte del color de estado** (halo naranja) · el que nunca reportó va translúcido · dos llamadas porque el payload del mapa no informa alertas |
| 08 | **Recortado: nearest-neighbor**, no VRP exacto · solo camiones `DISPONIBLE`, pero se dice cuántos quedaron afuera y por qué · la ruta nace `PROPUESTA` |
| 09 | Generar y asignar están separados a propósito · solo se asigna desde `PROPUESTA` · al confirmar, el camión pasa a `EN_RUTA` · **no hay endpoint de choferes**: hoy son datos falsos |
| 10 | **Recortado: sin offline** · layout **móvil** aparte · radio GPS de 100 m · el `403` dice a cuántos metros está, no "no tenés permisos" · el `409` resincroniza sin alarmar · sin carga manual de coordenadas: anularía el control |
| 11 | Layout aparte **sin sidebar, sin login y sin token** · Haversine sobre lat/lng · **no expone nivel de llenado ni alertas** (información operativa interna) |
| 12 | No está en el documento de la cátedra: **lo agregó ADR-004** para cubrir la dimensión 8 (IA/ML) · la confianza va al lado del número · por debajo de 0,5 lo dice explícito · sin lecturas ni siquiera llama al endpoint |

---

## Límites del backend visibles en la UI

1. No hay forma de poner un contenedor en `FUERA_DE_SERVICIO` (`PATCH /contenedores/:id` no acepta `estado`).
2. `GET /contenedores` no dice si el contenedor ya tiene sensor.
3. No hay endpoint para listar choferes (CU-09 los necesita para el `<select>`).
4. No hay endpoint para omitir una parada: `OMITIDA` existe en el enum y la UI lo pinta, pero nada lo produce.

## Cuatro huecos del contrato que hubo que llenar

Marcados con `PROPUESTA` en el código. Si Francisco elige distinto, se rehace el mock, no la pantalla.

| Hueco | Lo que asumimos |
|---|---|
| `code` del `403` de radio | `PARADA_FUERA_DE_RADIO` |
| Body del `200` de confirmar | La transición completa (parada, contenedor, alertas cerradas, estado de la ruta) |
| Forma de `GET /rutas/mias` | El objeto expandido de `GET /rutas/:id`, o `200` con `null` |
| Proyección de CU-11 | `{id, codigo, lat, lng, tipoResiduo, distanciaMetros}` |

El detalle de estos y de los otros tres pedidos de contrato está en
[CASOS-DE-USO.md](CASOS-DE-USO.md#pedidos-de-contrato-pendientes).
