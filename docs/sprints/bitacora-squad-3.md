# Bitácora · Residuos en el squad 3

Lo que fuimos haciendo y decidiendo, para contarlo en la exposición del Hito 2 (jue 19/11).

**Caso:** "Recolección inteligente después de un evento masivo". Termina un evento en una plaza y Residuos manda una escuadrilla a limpiar los tachos de la zona.
**Mi parte (Máximo, Residuos):** recibir `ActividadCreada` de Espacios, marcar los tachos cercanos, armar el recorrido de la escuadrilla al terminar el evento y que el chofer lo cierre.

## Jue 22/10 · Arranque

**Qué pide la consigna (Hito 2, 19/11):** módulo integrado, participar en al menos un caso de uso transversal, evidencia de colaboración entre squads, documentación completa y una demo unificada con eventos reales. Está en `docs/catedra/01 - Presentación de la Materia.pdf`.

**Qué acordamos en el squad:** el diagrama del squad tiene un solo evento, `ActividadCreada`, que publica Espacios. Reaccionan cuatro módulos: Residuos (escuadrilla de limpieza), Reclamos (vincula los reclamos de la zona), Emergencias (recursos en el rango) y Movilidad (reabastece las estaciones de bici).

**Decisión: achicar el alcance.** Armé un plan grande con 4 eventos, pero el squad marcó que había cosas fuera de lo acordado. Me quedo con lo del diagrama: un evento y la escuadrilla. Mi plan corto está en `docs/sprints/plan-maximo-residuos.md`.

**Mensajes que mandé:**
- Al squad 3: qué voy a hacer desde Residuos y qué necesito de cada uno.
- Al grupo 4: todavía no lo mandé. Les tengo que avisar que voy a tocar el módulo `integracion` y el webhook, que comparto con otros casos.

**Lo que respondieron:**
- **Rodrigo (Espacios):**
  - El evento ya existe adentro de Espacios (`cultura.evento_comunitario_publicado`). En el bus va a salir como `com.citypass.espacios.ActividadCreada`.
  - Los campos son: `communityEventId`, `capacity`, `status` (`ACTIVE`, `ACTIVE_FULL` o `CANCELLED`), `startDate` y `endDate` (ISO 8601, UTC).
  - Las coordenadas todavía no las tiene: va a sumar `latitude` y `longitude`. Mientras tanto las simulo en local.
- **Franco (EDA):**
  - Sin autenticarse, desde el 23/10 el bus no muestra eventos, así que hace falta un token de servicio.
  - Los namespaces no los define el EDA. Salen del token del Login.

**Qué queda pendiente de otros:**
- Nicolas Hernandez (Login): el token de servicio y el namespace `com.citypass.residuos`. Recién hace falta para conectar con el bus real.
- Grupo 4: avisar que voy a tocar `integracion`. Además, el código de Nico para este mismo evento espera otros nombres de campos (`cupoMaximo`, `latitud`, `fin`), así que con el evento real de Rodrigo no se activaría.

## Jue 22/10 · Paso 1: Residuos recibe `ActividadCreada`

Rama `feat/squad3-actividad-creada`, creada desde `develop`.

**Qué hace:** cuando llega `com.citypass.espacios.ActividadCreada` al webhook `POST /webhooks/citypass`, Residuos:
1. Descarta los eventos repetidos (por `eventId`). Esto ya lo hacía el código de Nico.
2. Ignora la actividad si es chica (menos de 1.000 personas), si está cancelada o si no trae coordenadas.
3. Busca los contenedores a 300 m o menos de la actividad.
4. Guarda la actividad en la tabla nueva `actividad_masiva`: título, capacidad, centro, inicio, fin y contenedores cercanos.

**Decisiones:**
- Uso los nombres de campos que pasó Rodrigo, en inglés, tal cual: así no hay que traducir nada.
- El corte de 1.000 personas es propio (`INTEGRACION_CAPACIDAD_MASIVA`). No toca el de 100 que usa Nico para su caso.
- Reuso lo que ya existía: el webhook, el descarte de repetidos y la búsqueda de contenedores cercanos.

**Archivos:**
- `backend/src/modules/integracion/domain/actividad-masiva.entity.ts`: la tabla nueva.
- `backend/src/migrations/1792708905000-ActividadMasiva.ts`: la migración que la crea.
- `backend/src/modules/integracion/application/integracion.service.ts`: la reacción al evento.
- `integracion.repository.ts`, `integracion.typeorm.repository.ts` e `integracion.module.ts`: guardar la actividad.

**Pruebas:**
- 6 tests nuevos: guarda con los contenedores cercanos, ignora menos de 1.000, ignora cancelada, ignora sin coordenadas, no toca el refuerzo de Nico y rechaza una fecha inválida. Los 24 tests del módulo pasan.
- En local, mandé al webhook un evento de ejemplo: "Festival de Primavera", 5.000 personas, al lado del contenedor CT-0004.
  - La primera vez respondió 204 y la actividad quedó guardada con 1 contenedor cerca.
  - Repetido: 204, pero no se guardó de nuevo.
  - Sin token: 401.

Para repetir la prueba (backend levantado y `GATEWAY_WEBHOOK_TOKEN=local-dev` en `backend/.env`):

```bash
curl -X POST "http://localhost:3000/api/v1/webhooks/citypass?token=local-dev" \
  -H 'Content-Type: application/json' \
  -d '{"metadata":{"eventId":"prueba-act-1","eventType":"com.citypass.espacios.ActividadCreada"},"data":{"communityEventId":"3f1c2a9e-0000-4000-8000-000000000001","title":"Festival de Primavera","capacity":5000,"status":"ACTIVE","startDate":"2026-10-23T18:00:00Z","endDate":"2026-10-23T23:00:00Z","latitude":-34.5990,"longitude":-58.3815}}'
```

**Próximo paso:** mostrar la zona del evento en el mapa (paso 2).
