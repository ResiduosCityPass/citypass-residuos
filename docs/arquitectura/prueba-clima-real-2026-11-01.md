# Prueba desde Espacios Públicos del 01/11/2026

## Resultado

Se creó, confirmó y finalizó una alerta nueva desde la aplicación real de Espacios
Públicos. La aplicación informó confirmación y cierre exitosos, pero ninguno de los
dos mensajes apareció en los tópicos climáticos de EDA durante las comprobaciones.
Por eso **no se completó la suspensión y recuperación entre equipos**: Residuos no
recibió esta alerta y no creó una contingencia. El flujo local con gateway de prueba
ya estaba cubierto por los E2E; ese resultado no reemplaza esta prueba remota pendiente.

No se modificaron ni finalizaron alertas ajenas al simulacro. No se usó el simulador
interno de Residuos para sustituir la recepción real.

## Alerta creada

- Identificador del ejercicio: `QA-RES-20261101`.
- `alertaId`: `b0e77c1d-7807-4add-bd48-f140c12728f5`.
- Fenómeno: `LLUVIA_INTENSA`; criticidad: `ALTA`.
- Barrio seleccionado en el catálogo: `SAN NICOLAS`.
- Punto transmitido: latitud `-34.603666`, longitud `-58.380515`.
- Actor registrado por Espacios Públicos: `U000009`.
- Inicio: `2026-11-02T00:12:00.000Z` (01/11, 21:12 en Argentina).
- Fin estimado: `2026-11-02T06:12:00.000Z`.
- Cierre real: `2026-11-02T00:16:40.694Z` (01/11, 21:16:40 en Argentina).
- Motivo y fuente indicaron explícitamente **SIMULACRO**, ejercicio académico y datos
  sintéticos. Esos campos son evidencia interna de Espacios Públicos y su mensaje EDA
  no los incluye.

La secuencia utilizada fue **Crear alerta manual → Guardar como pendiente → Confirmar
→ Confirmar y publicar → Finalizar**. Se verificó el mismo `alertaId` en las vistas de
confirmación y finalización. El botón “Ver mensaje” es una vista del registro y advierte
que no confirma la entrega a EDA.

## Evidencia de entrega

Se consultaron catálogo, metadatos y contadores de Kafka con la identidad de servicio
de Residuos, TLS y sin modificar offsets del consumidor operativo. La lectura de
diagnóstico se limitó a contadores; no consumió ni guardó históricos de otros equipos.

| Tópico, partición 0 | Low | High después de confirmar | High después de finalizar |
| --- | --- | --- | --- |
| `com.citypass.espacios.CriticidadClimaticaConfirmada` | 0 | 1 | 1 |
| `com.citypass.espacios.CriticidadClimaticaFinalizada` | 0 | 1 | 1 |

Ese único registro de cada tópico ya había sido recibido por Residuos antes del
simulacro. El catálogo seguía apuntando a esos tópicos, versión 1, schemas 28 y 27.
El panel local mostró **Kafka conectado**. La consulta por el `alertaId` de este
ejercicio en `alerta_climatica_externa` no devolvió registros y la tabla de
contingencias permaneció vacía.

Como control del camino de salida, se generó y asignó una ruta desde el frontend
de Residuos con login federado. Ambas publicaciones llegaron al gateway real y se
vieron en “Mis eventos” de EDA con la cuenta de Residuos:

| Evento | `data.eventId` estable de Residuos | Publicación UTC |
| --- | --- | --- |
| `com.citypass.residuos.RutaGenerada` | `c490ab47-7006-4970-a7b4-9b32e2d8632e` | `2026-11-02T00:12:45.265Z` |
| `com.citypass.residuos.RutaAsignada` | `a4d48ec7-0983-4c5a-81d2-45b1a9185c57` | `2026-11-02T00:13:15.036Z` |

El outbox local marcó ambos como `PUBLICADO`, sin errores ni reintentos. Los
identificadores `metadata.eventId` generados por EDA son distintos de estos IDs.

Los contadores sin cambios ubican el bloqueo antes de la recepción en Residuos.
**No determinan la causa exacta**: falta revisar configuración, adaptador y Outbox
del backend de Espacios Públicos, además de su destino y respuestas HTTP del gateway.
No corresponde atribuir el problema a una variable o a un error de schema sin esos datos.

## Entorno local preparado para continuar

- Frontend: `http://localhost:5173`.
- API: `http://127.0.0.1:3038/api/v1`.
- Base aislada: `residuos_integracion_real_demo`, PostgreSQL local 55433.
- Login humano real: delegado de Residuos con rol **OPERADOR**, sin elevar permisos.
- Transporte real de salida y consumidor Kafka habilitados; simulador climático interno
  apagado.
- Se habilitó `VITE_SIMULAR_GPS=true` solamente en la copia ignorada del perfil local
  para confirmar los futuros vaciados con la posición de los contenedores desde esta
  computadora. No se cambió el ejemplo ni una configuración desplegada.

| Recurso de prueba | Estado preparado |
| --- | --- |
| `QA-CLIMA-01`, Centro | 90 %, CRITICO, parada pendiente en la ruta asignada |
| `QA-CLIMA-02`, Centro | 30 %, NORMAL, pendiente de incorporar a la futura recuperación |
| `QA-CLIMA-03`, Norte | 85 %, CRITICO, control fuera de la zona que se planea suspender |
| Camión `QA110126` | Asignado a la ruta inicial |
| Chofer `QA-CLIMA-1101`, Simulacro integración | Credencial interna temporal de prueba |
| Ruta inicial | `84e63398-09ec-4b2f-b4d3-8dd1cc93b6f0` |

No se vaciaron contenedores ni se afirmó haber comprobado la restricción geográfica:
esas verificaciones dependen de recibir y resolver una alerta nueva.

## Qué falta para terminar

1. Revisar en Espacios Públicos por qué confirmar/finalizar informa éxito sin sumar
   registros en esos tópicos. Se solicitó el repositorio de su backend para investigar.
2. Con la publicación corregida, usar una alerta nueva y mantenerla activa mientras se
   comprueba la suspensión. Si se reentregan el inicio y cierre de este ejercicio, ambos
   podrían llegar antes de revisarlo y no permitirían observar una suspensión activa.
3. En Residuos, seleccionar **Centro** y fundamentar la afectación por inundación.
4. Verificar la parada suspendida, su rechazo en backend, los niveles sin cambios y
   `ServicioAfectado` en EDA. Comprobar que Norte no queda restringido.
5. Finalizar la misma alerta en Espacios Públicos y verificar `RecuperacionPendiente`.
6. Habilitar recuperación; verificar `RecuperacionHabilitada`; completar los vaciados
   de ambos contenedores de Centro, incluyendo el que empezó al 30 %.
7. Verificar `RECUPERADA` y `ServicioRestablecido` en el bus con el mismo `alertaId`.

No se modificó código de aplicación durante esta prueba ni se repitió la suite: los
resultados previos de tests y cobertura están en [la guía de integración](integracion-login-clima.md#validaci%C3%B3n).
