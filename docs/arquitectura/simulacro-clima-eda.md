# Simulacro de inundación publicado directamente en EDA

## Modalidad y estado del 02/11/2026

Residuos puede publicar dos tipos propios con su cuenta de servicio, sin depender
del publicador de Espacios Públicos:

- `com.citypass.residuos.SimulacroClimaticoConfirmado`.
- `com.citypass.residuos.SimulacroClimaticoFinalizado`.

Conservan el payload climático y entran por el mismo procesamiento de recepción,
deduplicación, revisión, suspensión y recuperación. El camino previsto es
**CLI → gateway EDA → Avro/Kafka → inbox → revisión del operador → contingencia → outbox → EDA**.

Los tipos están apagados por defecto. `EDA_CLIMA_SIMULACRO_ENABLED=true` los agrega a
las suscripciones del consumidor solo en desarrollo/test. Producción rechaza habilitarlos.
Las suscripciones reales de Espacios Públicos siguen funcionando. Cada simulacro tiene
un ID nuevo con prefijo `SIMULACRO-RES-`, actor `simulacro-residuos` y exige como emisor
la cuenta de servicio configurada para Residuos. La interfaz distingue este origen y
las contingencias llevan **SIMULACRO** en su descripción. No se mezclan sus etapas
con las de otros orígenes.

**Registro y prueba completa por Kafka finalizados.** Después del cambio de red del
02/11 funcionaron HTTPS y Kafka/TLS en 9092. Se publicaron inicio y fin y se recorrieron
todas las etapas hasta RECUPERADA, incluyendo el contenedor no crítico. Los schemas
de simulacro son 39 y 40, versión 1. No se deshabilitó TLS ni se cambiaron DNS.
Ver [resultado y evidencia de la prueba real](prueba-eda-real-2026-11-02.md).

## Entorno preparado

Para nuevas pruebas se puede preparar un escenario completo con
[`demo:preparar`](datos-demo-inundacion.md). Crea recursos `DEMO-<escenario>` y una ruta
inicial asignada, sin depender de scripts temporales. Elegir esa zona en la revisión
y en el ruteo; los recursos `QA-EDA-*` de abajo corresponden al ensayo histórico.

Frontend: `http://localhost:5173`. API: `http://127.0.0.1:3038/api/v1`.
PostgreSQL local 55433, base aislada `residuos_integracion_real_demo`.
El delegado conserva rol **OPERADOR**, sin permisos de administrador.

El perfil backend `.env.integration.local`, ignorado por Git, contiene:

```dotenv
NODE_ENV=development
EVENT_BUS_DRIVER=platform
EDA_CONSUMER_ENABLED=true
EDA_CLIMA_SIMULACRO_ENABLED=true
EDA_NAMESPACE=com.citypass.residuos
EDA_KAFKA_SSL=true
EDA_KAFKA_GROUP_ID=com.citypass.residuos.residuos-simulacro-local-v1
CLIMA_SIMULADOR_HABILITADO=false
```

El grupo Kafka local es separado del grupo operativo. Los secretos están solo en el
backend. El simulador HTTP climático está apagado en este perfil.

| Recurso | Estado inicial |
| --- | --- |
| `QA-EDA-01`, Centro | CRITICO, 90 % |
| `QA-EDA-02`, Centro | NORMAL, 30 % |
| `QA-EDA-03`, Norte | CRITICO, 85 %, control fuera de la zona afectada |
| Camión `QA021126` | Disponible, COMUN, 10.000 L |
| Chofer `QA-EDA-1102` | Simulacro EDA Residuos, activo |

La tabla muestra el estado inicial del ensayo completado. Actualmente ambos contenedores
de Centro están en 0 %, las dos rutas están completadas y la contingencia está RECUPERADA.
Las zonas siguen sin bloqueo manual. La carga inicial de datos no publicó eventos de negocio.
Se preparó una credencial interna temporal de chofer para la ejecución asistida; habrá
que regenerarla si vence antes de retomar. La simulación de GPS está habilitada solo
en la copia local del perfil frontend. No se cambió una configuración desplegada.
Los datos y archivos temporales de esta sesión pueden desaparecer al limpiar `/tmp`.

## Registrar los tipos cuando vuelva el acceso a EDA

Desde `backend`, con las credenciales de servicio ya configuradas:

```bash
# Revisar los dos schemas sin conexión:
npm run eda:simulacro -- plan

# Registrar los tipos en nuestro namespace:
ENV_FILE=.env.integration.local npm run eda:simulacro -- registrar --apply
```

El registro compara los campos si los tipos ya existen y no cambia ni borra schemas.
Si los tipos de simulacro faltan, el consumidor mantiene habilitados los eventos reales
y el frontend informa su registro pendiente. Después de registrar los tipos, reiniciar
el backend para agregarlos a la suscripción. Antes de publicar, comprobar
**Kafka conectado** en `/contingencias/clima` y el aviso de simulacros habilitados.

## Probar todo el flujo

1. **Ruta previa.** En Rutas generar una propuesta para `QA021126`, seleccionando
   **Centro**. Debe incluir `QA-EDA-01`, que está crítico. Confirmarla y asignarla a
   `QA-EDA-1102`. Su vista de chofer debe mostrar esa parada pendiente al 90 %.

2. **Inicio por EDA.** Ejecutar desde `backend`:

   ```bash
   ENV_FILE=.env.integration.local npm run eda:simulacro -- inicio --apply
   ```

   El comando genera un ID nuevo, inicio vigente y fin estimado a una hora. Envía
   solo el payload de negocio; el gateway genera metadata y Avro. Copiar el
   `alertaId` que imprime para usarlo al cerrar.

3. **Recepción.** Actualizar `/contingencias/clima`. Debe aparecer ese ID como
   **SIMULACRO de Residuos recibido por EDA**. Recibirlo aún no suspende la recolección.
   En “Mis eventos” de EDA debe verse `SimulacroClimaticoConfirmado`.

4. **Suspensión.** Seleccionar solamente **Centro**, fundamentar la decisión con
   SIMULACRO y confirmar. La contingencia debe quedar **ACTIVA**, con dos contenedores
   pendientes. Actualizar la vista del chofer: la parada de `QA-EDA-01` queda suspendida
   y sin acción de vaciado. El backend también debe rechazar la confirmación mientras
   está restringida. Los llenados siguen en 90 % y 30 %; Norte queda sin restricción.
   EDA debe mostrar `com.citypass.residuos.ServicioAfectado`.

5. **Cierre separado.** Después de observar la suspensión, publicar el fin con
   exactamente el ID del paso 2:

   ```bash
   ENV_FILE=.env.integration.local npm run eda:simulacro -- fin --alerta 'SIMULACRO-RES-UUID_DEL_INICIO' --apply
   ```

   No se publica automáticamente al crear el inicio ni por alcanzar `vigenciaHasta`.

6. **Recuperación pendiente.** La contingencia pasa a **PENDIENTE_RECUPERACION** y la
   parada continúa restringida. Verificar el cierre de prueba y
   `com.citypass.residuos.RecuperacionPendiente` en EDA.

7. **Habilitación.** En Inundaciones pulsar **Habilitar recuperación**. Debe pasar a
   **EN_RECUPERACION**, desbloquear la parada y publicar
   `com.citypass.residuos.RecuperacionHabilitada`.

8. **Primer vaciado.** En la vista del chofer activar **Simular que estoy en el
   contenedor**, actualizar y confirmar `QA-EDA-01`. Queda en 0 %, la ruta termina y
   resta un contenedor pendiente. La contingencia permanece **EN_RECUPERACION**.

9. **Contenedor no crítico.** Generar otra ruta para **Centro** con el camión ahora
   disponible. Debe incluir `QA-EDA-02` por estar pendiente de recuperación, aunque
   solo tenga 30 % de llenado. Asignarla al mismo chofer y confirmar su vaciado.

10. **Servicio restablecido.** Verificar ambos contenedores de Centro en 0 %, ambas
    rutas completadas y la contingencia **RECUPERADA**. Debe publicarse
    `com.citypass.residuos.ServicioRestablecido`. El contenedor de Norte sigue al
    85 % si no se recolectó por otra operación.

Las cuatro respuestas conservan el ID del simulacro en `data.alertaId` y
`data.correlationId`. Para repetir el recorrido con vaciados, preparar nuevamente
contenedores de prueba con llenado y publicar otro inicio: siempre genera un ID nuevo.

## Validación local

Pasaron **556 tests unitarios de backend**, **379 de frontend** y **112 E2E** contra
PostgreSQL descartable con migraciones reales. Cobertura de líneas: backend **92,05 %**,
frontend **93,98 %**. Lint, tipado y builds correctos.

Los E2E incluyen las cuatro respuestas del simulacro y su rechazo cuando el modo está
deshabilitado. La suite de inundaciones verifica restricciones, rutas, vaciados y la
recuperación del contenedor no crítico. El gateway de los E2E es local; las pruebas
unitarias del consumidor usan dobles de Kafka.

Se comprobó en navegador el login federado real como OPERADOR y el aviso de simulacros
habilitados. Los dos tipos se registraron y se verificaron en el catálogo real de EDA.
El cambio de red permitió completar después el flujo por el Kafka compartido. Se
verificaron los dos mensajes entrantes y las cuatro respuestas de la misma alerta,
con ambos contenedores recuperados. Detalle en [la prueba real](prueba-eda-real-2026-11-02.md).
