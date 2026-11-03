# Inundaciones: suspensión y recuperación de Residuos

Implementación del caso transversal «Evento climático que afecta múltiples servicios».
Este documento describe el simulador aislado y su contrato interno original. La integración
real con Login, Kafka y el payload actual de Espacios Públicos está implementada y se documenta
en [Integración con Login y EDA](integracion-login-clima.md).

## Flujo implementado

1. Un evento de inicio registra una inundación y sus zonas. Las restricciones son independientes
   del bloqueo manual de `zona.bloqueada` y de otras inundaciones.
2. Esas zonas quedan fuera de nuevas propuestas. Las paradas pendientes de rutas existentes se
   muestran suspendidas y el backend rechaza confirmarlas u omitirlas. Las paradas confirmadas
   conservan su historial; el llenado y las alertas no se modifican por el clima.
3. El evento de finalización pasa a `PENDIENTE_RECUPERACION`. La restricción continúa.
4. El operador habilita la recuperación. Se retira **solo** la restricción de esa inundación,
   se incorpora la acumulación hasta ese momento y la contingencia pasa a `EN_RECUPERACION`.
5. Se retoman las rutas existentes o se generan propuestas para los contenedores sin ruta.
   Los pendientes de recuperación entran aunque no sean críticos y tienen prioridad antes
   del criterio habitual de cercanía, respetando capacidad, tipo de residuo y restricciones.
6. Confirmar un vaciado actualiza el avance de todas las contingencias en recuperación que
   incluyen ese contenedor. Omitir no cuenta como vaciado. La última confirmación pasa a
   `RECUPERADA` y publica el restablecimiento. Si no hay trabajo pendiente, se recupera al habilitar.

Las rutas con paradas suspendidas siguen activas y reservan su camión y contenedores. Esto permite
continuar las paradas habilitadas y reanudar las suspendidas sin duplicarlas. Las propuestas
afectadas no se pueden asignar: el operador puede esperar la habilitación o descartarlas.
No se implementó cancelación de rutas ya asignadas ni reasignación entre camiones.

## Backend y persistencia

`ContingenciasModule` depende de un puerto de persistencia y del publicador existente. Las tablas
`contingencia`, `contingencia_zona` y `contingencia_contenedor` guardan estado, causas y trabajo
pendiente. `evento_climatico_recibido` funciona como inbox con `eventId` único y huella del contenido.
Una zona con historial de contingencias no se elimina; los contenedores conservan su baja lógica.

El consumo guarda inbox, restricciones e impactos y escribe los eventos de salida en la outbox
dentro de una misma transacción. El consumidor EDA deberá confirmar el mensaje **después** de que
`ContingenciasService.procesarEvento()` termine; errores transitorios deben reintentarse.
El adaptador de transporte y su política de reintentos/DLQ siguen pendientes de integración.

Inicio, finalización, habilitación, generación y asignación de rutas y cierre de paradas comparten
un advisory lock transaccional de PostgreSQL (`734012, 1`). Serializa estas decisiones para evitar
que un vaciado o una asignación se confirme con una restricción de inundación desactualizada.
El lock global es deliberado para el volumen del trabajo práctico; si aumenta la escala se puede
reemplazar por locks por zona con un orden de adquisición estable.

## Contrato provisional de entrada v1

Ambos eventos llevan el snapshot completo de zonas y descripción:

```json
{
  "eventId": "63f571c2-aea6-4ba5-98ba-fac0d8dedc39",
  "eventType": "espaciospublicos.inundacion.iniciada",
  "occurredAt": "2026-10-19T14:00:00.000Z",
  "source": "espaciospublicos-service",
  "version": 1,
  "correlationId": "404e6f56-206d-4371-9867-15c94030516d",
  "payload": {
    "inundacionId": "404e6f56-206d-4371-9867-15c94030516d",
    "revision": 1,
    "descripcion": "Inundación en Centro",
    "zonaIds": ["ac9c0c46-d1d0-4c5e-90d0-f81bcf294641"]
  }
}
```

Para finalizar: `eventType = espaciospublicos.inundacion.finalizada`, mismo `inundacionId`, nuevo
`eventId` y una `revision` mayor. `version` identifica el esquema; `revision` ordena los cambios de
una inundación. No se usa la hora de llegada para ordenar eventos.

- Reentregar el mismo `eventId` y contenido no duplica efectos. Reutilizarlo con otro contenido da 409.
- Revisiones anteriores o iguales se registran como ignoradas. Una finalización que llega primero
  deja la contingencia pendiente de habilitación; un inicio atrasado no la reactiva.
- Una inundación finalizada no se reabre. Otra ocurrencia usa otro identificador.
- Las zonas son inmutables en v1. Para ampliar el área se crea otra contingencia independiente.
- Los UUID de zona son **locales a Residuos**. El futuro adaptador EDA debe resolver códigos
  compartidos antes de llamar al caso de uso. Una zona desconocida rechaza el evento sin procesarlo.
- Esta primera versión modela inundaciones que suspenden el servicio. No tiene pronósticos ni
  reglas por severidad meteorológica.

## Eventos de salida

Con el sobre común de Residuos y el `correlationId` de la inundación:

| Evento | Momento |
|---|---|
| `residuos.servicio.afectado` | Se registra la inundación |
| `residuos.recuperacion.pendiente` | Se informa la finalización |
| `residuos.recuperacion.habilitada` | El operador habilita la recuperación |
| `residuos.servicio.restablecido` | Se completan los vaciados pendientes |

El restablecimiento se refiere a esa contingencia: no elimina bloqueos manuales ni declara
resueltos otros incidentes.

## API y permisos

Todos requieren JWT con rol `ADMINISTRADOR` u `OPERADOR`:

| Método y ruta bajo `/api/v1` | Resultado |
|---|---|
| `GET /contingencias` | `{ simuladorHabilitado, contingencias }` con zonas y avance por contenedor |
| `GET /contingencias/:id` | Detalle de la inundación |
| `POST /contingencias/simulador/inicio` | `{ descripcion, zonaIds }`; genera el evento de inicio |
| `POST /contingencias/simulador/:id/finalizacion` | Genera el evento de finalización |
| `PATCH /contingencias/:id/recuperar` | Habilita la recuperación; es idempotente |

Los endpoints del simulador están disponibles en `development` y `test` con
`CLIMA_SIMULADOR_HABILITADO=true` (valor por defecto). Se deshabilitan con `false` y **siempre**
en `NODE_ENV=production`, aunque la bandera diga `true`. En ese caso responden 404.
La habilitación operativa sí permanece disponible en producción.

El mapa agrega `recoleccionSuspendida`, las zonas agregan `restriccionesInundacion`, y las rutas
agregan `paradasSuspendidas`, `paradasBloqueadasManualmente` y `contingenciaIds`. Cada parada
pendiente detalla sus restricciones. La columna `bloqueada` sigue representando solo el bloqueo
manual; no se debe usar sola para inferir si la zona admite recolección.

## Levantar y demostrar

1. Levantar PostgreSQL con `docker compose -f infra/docker-compose.yml up -d postgres`.
2. Configurar el entorno local siguiendo `backend/.env.example` y aplicar migraciones:
   `cd backend && npm run migration:run && npm run start:dev`.
3. Levantar el frontend con `cd frontend && npm run dev` y usar un JWT del backend local.
4. Cargar zonas, contenedores con lecturas y flota. Generar y asignar una ruta para demostrar
   la suspensión sobre recorridos existentes. Abrir `/chofer` con su credencial en otro navegador.
5. Entrar a `/contingencias`, seleccionar zonas y simular el inicio. Verificar el aviso en el mapa
   y la suspensión en el detalle de la ruta y en la vista del chofer.
6. Simular la finalización: las paradas siguen suspendidas. Habilitar la recuperación como operador.
7. Retomar las paradas existentes o generar propuestas para los contenedores sin ruta. Confirmar
   los vaciados con el chofer: la contingencia pasa a «Servicio recuperado».

La pantalla de contingencias y el detalle de ruta se actualizan cada 15 segundos; la vista del
chofer también tiene actualización periódica y botón manual. El mapa conserva su polling de 30 s.
El modo legado `VITE_USE_MOCKS=true` no simula este flujo: se necesita el backend real.

También se pueden generar los eventos desde la terminal:

```bash
cd simulator
TOKEN=<jwt-local> npm run inundacion -- inicio <zonaId[,zonaId]> "Inundación de prueba"
TOKEN=<jwt-local> npm run inundacion -- fin <inundacionId>
```

Las pruebas unitarias se ejecutan con `cd backend && npm run test:cov -- --runInBand` y
`cd frontend && npm run cobertura`. `backend/test/inundaciones.e2e-spec.ts` verifica el flujo HTTP,
las consultas reales y el rollback de inbox/restricciones ante una falla de outbox; corre con el
PostgreSQL de tests mediante `npm run test:e2e`.

## Límites del alcance

- El planificador ordena contenedores por proximidad: excluir una zona no garantiza que un camino
  vial no la atraviese. Evitar calles inundadas requiere integrar Movilidad y un motor de recorridos.
- El cierre mide los contenedores con residuos acumulados al habilitar la recuperación; no intenta
  mantener todos los contenedores vacíos frente a futuras lecturas.
- Un contenedor fuera de servicio o dado de baja conserva el trabajo pendiente. Debe resolverse
  su situación operativa antes de completar la contingencia; no se declara vaciado artificialmente.

## Verificación local — 19/10/2026

| Suite | Resultado | Cobertura de líneas |
|---|---|---|
| Backend, unitarios | 443 tests aprobados | 90,75% |
| Backend, integración | 95 tests aprobados, incluidos 10 de inundaciones | 88,03% |
| Frontend | 347 tests aprobados | 93,31% |

El servicio de contingencias y la pantalla de inundaciones tienen 100% de cobertura unitaria
de líneas. Los reportes usan la configuración de cobertura existente del proyecto. También
pasaron lint, typecheck del backend y los builds de ambos proyectos.

Las pruebas integrales locales se ejecutaron contra PostgreSQL nativo 18.4 en una base descartable,
con migraciones reales. El pipeline existente continúa usando PostgreSQL 16. No se ejecutó el CI
remoto como parte de esta verificación local.

La demo en navegador recorrió inicio, finalización, habilitación, vaciado de una parada suspendida,
generación de una nueva ruta para un contenedor al 30% y cierre automático de la contingencia
después del último vaciado.
