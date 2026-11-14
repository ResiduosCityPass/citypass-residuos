# Tablero de Analítica de Residuos

Contrato de referencia: `guia-para-equipos.md` entregada por el Grupo 8.

## Acceso y entrega del HTML

1. El usuario inicia sesión con Login Federado.
2. Residuos permite ver Métricas a `ADMINISTRADOR` y `OPERADOR`, incluido el delegado. La pantalla verifica el rol antes de pedir el tablero; la API vuelve a exigir identidad humana, módulo Residuos y rol autorizado con los guards globales. Choferes, ciudadanos y cuentas sin rol no consultan Analítica.
3. El frontend llama `GET /api/v1/metricas/tablero` con su sesión habitual. No envía destinos ni identificadores de otros tableros.
4. La API solicita `GET {ANALITICA_URL}/embed?dashboard=residuos` reenviando **el mismo** `Authorization: Bearer <access_token>` del usuario. No usa el token de EDA, no crea un token nuevo y no reenvía cookies. El destino está fijado por configuración; no se siguen redirecciones que pudieran recibir la credencial.
5. Analítica valida el token y su módulo y devuelve HTML. Residuos lo entrega como JSON `{ html }` con `Cache-Control: private, no-store` y `Vary: Authorization`. Así nunca se sirve código de otro equipo como una página del origen de la API.
6. El frontend asigna el HTML a `iframe.srcdoc` con `sandbox="allow-scripts"`, sin `allow-same-origin`, sin `src`, sin enlaces de apertura sin autorización y sin guardar el HTML en storage. Cambiar de cuenta, rol, salir de la pantalla o actualizar desmonta el HTML anterior. Las respuestas tardías no vuelven a mostrarlo.

El intermediario permite usar el contrato aunque Analítica todavía no configure CORS para navegadores. Si luego habilitan CORS, no hace falta cambiar el flujo.

Ante `401`, el cliente existente renueva la sesión contra Login y reintenta **una** vez con el nuevo token. Un segundo `401` invalida la sesión local. `400`/`403` no disparan refresh; `503`, timeout o falta de conexión muestran “Analítica no disponible” y permiten reintentar. Sin URL configurada, se informa que falta conectar el tablero y el resto de la aplicación sigue funcionando.

El proveedor puede enviar `{ tipo: 'citypass-tablero-altura', altura: 1200 }` por `postMessage`. Solo se aceptan mensajes de la ventana del propio iframe y alturas numéricas finitas entre 320 y 10.000 píxeles (se acotan valores fuera del rango). El origen del iframe es opaco por el sandbox.

## Configuración y alta

- **Backend:** `ANALITICA_URL=https://<direccion-confirmada-del-equipo>` (raíz del servicio, sin `/embed`, query, fragmento ni credenciales). Admite un prefijo si el servicio está publicado bajo `/api`, por ejemplo. En producción exige HTTPS; HTTP solo se admite en loopback de desarrollo/test.
- **Frontend:** no requiere `VITE_BI_DASHBOARD_URL`. La ruta Métricas consulta nuestra API y no necesita recompilarse para cambiar la URL del proveedor.
- **Render:** configurar `ANALITICA_URL` en `citypass-residuos-api` y aplicar la configuración con un deploy. El Blueprint declara esta variable como externa (`sync: false`), sin afectar Login, EDA ni la base de datos.
- El token real comprobado el 14/11 contiene `module=residuos`, `token_use=human` y **no** contiene `department`. El identificador del tablero es `residuos`. Se debe validar con Analítica que su alta acepte el claim `module` de Login; el intermediario no altera claims ni vuelve a firmar el token.
- Para el alta, coordinar una cuenta de prueba de Residuos por un canal privado; no poner contraseñas ni tokens en documentación, PRs o variables `VITE_*`.
- La dirección real de Analítica y la prueba contra ese servicio quedan pendientes hasta que el Grupo 8 entregue la URL. Las pruebas automatizadas usan un proveedor controlado, no simulan que los números sean de producción.

## Caso de eventos climáticos

La publicación del caso climático es independiente del HTML del tablero y se conserva:

- Espacios Públicos emite `CriticidadClimaticaConfirmada`; Residuos la recibe por el consumidor único Kafka o el webhook y la presenta en Alertas.
- Al confirmar la suspensión sobre las zonas elegidas, Residuos publica `IntervencionActualizada` por cada parada pendiente de una ruta asignada o en curso: `estadoAnterior=PROGRAMADA`, `estadoNuevo=AFECTADA`, `causaId=alertaId`, `causaTipo=EVENTO_CLIMATICO`, `correlationId=alertaId` y `camionId` de la cuadrilla.
- Analítica cuenta camiones distintos por alerta, no mensajes. Reintentos o eventos duplicados no deben sumar una cuadrilla extra. Las propuestas aún sin asignación y las paradas ya resueltas no entran en esa afectación.
- El cierre de la alerta y la recuperación operativa conservan sus estados y publicaciones actuales. No se modifica la planificación ni se recalculan métricas en el frontend.
- Los indicadores se recalculan **una vez por día** y el informe de IA **los lunes**, según la guía. Un evento recién publicado en EDA no tiene por qué verse inmediatamente en el HTML.

## Verificación

Automatizada: guards reales por HTTP, autorización previa al proveedor, token humano intacto solo en cabecera, tablero fijo, aislamiento de HTML, ausencia de caché, respuestas 400/401/403/503, renovación única, descarte de respuestas tardías y resize del iframe. El e2e de métrica climática cubre el evento publicado y su esquema Avro contra PostgreSQL.

Con la URL real:

1. Configurar el backend y entrar como administrador y como delegado en Métricas. Verificar HTML y reporte semanal sin errores en el navegador.
2. Comprobar que una identidad de otro módulo o sin rol autorizado no pueda consultar el tablero.
3. Seguir la prueba de suspensión climática con al menos una ruta asignada en una zona afectada; registrar `alertaId` y las patentes afectadas en EDA.
4. Después del siguiente procesamiento diario de Analítica, comparar el conteo de cuadrillas distintas por `alertaId` con el tablero. La actualización manual recarga el HTML disponible; no fuerza su cálculo diario.
