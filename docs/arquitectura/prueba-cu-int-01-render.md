# Pruebas de CU-INT-01 en Render con Emergencias — 13/11 y 16/11/2026

## Resultado

**Completadas.** Una emergencia real de Emergencias (Grupo 5), publicada por el gateway de EDA,
bloqueó la zona del Obelisco en Residuos, sacó de la ruta en curso las paradas a menos de 300 m y
cada parada salió hacia EDA como `IntervencionActualizada`. Todo pasó en los servicios desplegados:
la API y el frontend de Residuos en Render, el gateway y el broker compartidos de EDA y el backend de
producción de Emergencias. No se usaron el simulador ni el bus en memoria.

La prueba del 16/11 es la que cuenta para la métrica de Analítica. Corrió con el #110 desplegado
(release #116): la emergencia llega sin causa y cada parada sale con `causaTipo = INCIDENTE_VIAL` y
`causaId = emergenciaId`, como se acordó con Analítica el 14/11. El contrato está en
[`contratos-de-eventos.md`](contratos-de-eventos.md).

## Cómo se arma la prueba

El orden importa: **la ruta tiene que estar asignada antes de que llegue la emergencia.**

1. Una ruta `ASIGNADA` con paradas pendientes a menos de 300 m del punto de la emergencia.
2. Emergencias crea la emergencia (`INFRAESTRUCTURA`, que sale con `afectaCirculacion: true`) en
   latitud -34.6037, longitud -58.3816. Las coordenadas llegan en `data.latitud` y `data.longitud`,
   redondeadas a 3 decimales. Las de `data.ubicacion` llegan cifradas y no se usan.
3. Se verifica en la API de Residuos (zonas y rutas) y en "Mis eventos" de la consola de EDA con la
   cuenta de Residuos (`grupo6`).
4. Emergencias lleva la emergencia a `RESUELTA` y se verifica que la zona se libere.

Si la ruta se arma con la zona ya bloqueada, el generador no incluye esos contenedores y no hay
ninguna parada para afectar.

## 16/11 — Con la causa para Analítica (#110)

### Primer intento: sin ruta cerca

La emergencia `12452f23-16bb-458b-aeaf-76804b32ce79` llegó cuando la única ruta asignada era la del
demo de CU-INT-02 (camión FR123AN). Sus contenedores estaban a entre 533 y 638 m del Obelisco, fuera
del radio de 300 m, así que no se afectó ninguna parada y no salió ningún evento. Es lo esperado:
solo sirvió para ver el orden en que hay que armar la prueba.

### Identificadores

- Emergencia: `9f7698fd-bbaa-4d9a-8516-dc614cefa5ca` (`INFRAESTRUCTURA`, Obelisco), creada por
  Emergencias a las 19:50 de Argentina.
- Ruta: `3a2ea7ba-336b-4e27-a814-24a3d0d3d119`, armada y asignada por Ramiro.
- Camión: `QA123ZZ`; chofer: SIMULACRO WEB02; zona: DEMO-WEB02 Centro.
- Paradas: DEMO-WEB02-01, a 0 m del Obelisco (parada `f9e98abd-4eaf-40f1-9641-bf959207ba06`), y
  DEMO-WEB02-02, a 50 m (parada `6b693e27-333d-4907-96fa-6852f19d79cd`).

### Verificaciones realizadas

| Paso | Resultado observado |
| --- | --- |
| Antes de la emergencia | Ruta `ASIGNADA` con las dos paradas pendientes y la zona DEMO-WEB02 Centro habilitada |
| Llegada de `EmergenciaCreada` | La zona DEMO-WEB02 Centro quedó bloqueada (sin bloqueo manual) |
| Paradas | Las dos quedaron `OMITIDA` a las 19:50:55, con el motivo "Zona bloqueada por la emergencia 9f7698fd-…" |
| Ruta | Pasó a `COMPLETADA`: al omitir la última parada pendiente, la ruta se cierra y libera el camión |
| EDA | Llegaron dos `IntervencionActualizada`, uno por parada, a las 19:51:00 |
| Cierre | Emergencias la llevó a `RESUELTA` y después a `CERRADA` (20:39). La zona DEMO-WEB02 Centro volvió a habilitada |

### Publicaciones comprobadas en EDA

En "Mis eventos" de la consola de EDA, con la cuenta de Residuos. Los dos eventos tienen
`eventType = com.citypass.residuos.IntervencionActualizada`, `source = grupo6` y `schemaId = 47`.
Tienen distinto `eventId` y distinto `payloadHash`, así que no son duplicados.

| `intervencionId` (parada) | `metadata.eventId` | Recibido en EDA |
| --- | --- | --- |
| `f9e98abd-4eaf-40f1-9641-bf959207ba06` | `2708ffe6-2847-4726-9fa5-1b6dca20dc35` | 19:51:00 |
| `6b693e27-333d-4907-96fa-6852f19d79cd` | `8ceb91e9-2730-41ee-81f9-728c961bc49e` | 19:51:00 |

`data` del primero; el segundo solo cambia `intervencionId` y `updatedAt`:

```json
{
  "intervencionId": "f9e98abd-4eaf-40f1-9641-bf959207ba06",
  "camionId": "QA123ZZ",
  "estadoAnterior": "PROGRAMADA",
  "estadoNuevo": "AFECTADA",
  "causaId": "9f7698fd-bbaa-4d9a-8516-dc614cefa5ca",
  "causaTipo": "INCIDENTE_VIAL",
  "correlationId": "9f7698fd-bbaa-4d9a-8516-dc614cefa5ca",
  "updatedAt": "2026-11-16T22:50:55.372Z"
}
```

Con esto, la métrica del caso 4 de Analítica (`camionId` distintos con `estadoNuevo = AFECTADA` y
`causaTipo = INCIDENTE_VIAL`) cuenta 1 cuadrilla afectada (QA123ZZ) y 2 paradas.

## 13/11 — Primera prueba de punta a punta

- Emergencia: `abd3b323-b59a-425b-a693-4c8b1259a7dc` (`INFRAESTRUCTURA`, Obelisco), con una ruta
  asignada por Ramiro que pasaba por ahí.
- La emergencia bloqueó la zona, omitió las paradas cercanas y el `IntervencionActualizada` llegó a
  EDA. Todavía sin el #110, así que salió con `causaId` y `causaTipo` en `null`.
- Emergencias la llevó a `RESUELTA` y después a `CERRADA`. Con `RESUELTA` la zona se desbloqueó; el
  `CERRADA` no cambia nada. Las paradas omitidas no vuelven a esa ruta: los contenedores entran en
  la próxima ruta que se genere.

### Lo que se encontró y se corrigió

`EmergenciaCreada` llegó **duplicado**: mismo `payloadHash`, distinto `eventId`, con unos 50 s de
diferencia. El gateway tardó unos 30 s en contestar un POST, el cliente de Emergencias cortó a los
15 s y reintentó, pero el primero ya había entrado. El gateway genera un `eventId` nuevo en cada
POST y no acepta uno del productor, así que un reintento siempre sale con otro id.

Esa vez no hizo daño, porque Residuos guarda un solo bloqueo por emergencia. Pero si el duplicado
llegaba después del cierre, la zona quedaba bloqueada para siempre. Se corrigió en:

- **#102:** una emergencia ya cerrada no vuelve a bloquear zonas.
- **#103:** Residuos espera 45 s al gateway antes de reintentar, como Emergencias, para no publicar
  sus propios eventos duplicados.

## Pendiente

- **Tablero de Analítica:** los eventos llegan a EDA con el formato acordado, pero el tablero que
  Analítica entrega embebido todavía no muestra la métrica. Su frontend no carga las métricas por
  caso en modo embebido (`useDashboardImpact.ts` devuelve `null`), y su backend arma las de Residuos
  solo desde `parte2/waste.json` en Gold, que tiene que generar otro proceso de ellos. Depende de
  Analítica.
