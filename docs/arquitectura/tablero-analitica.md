# Tablero de Analítica de Residuos

Contrato vigente: `integración-analitica.md`, recibido del Grupo 8 el 16/11/2026. Reemplaza la ruta y el mecanismo de embed de la guía anterior.

## Proveedor y prueba real

- Base de producción: `https://citypass-backend-prod-becqetepcjbqa8c7.brazilsouth-01.azurewebsites.net`.
- Endpoint: **GET `/embed/residuos`**, sin body, con `Authorization: Bearer <access_token human>` y `Accept: text/html`.
- Login: `clientId=citypass-residuos-web`, audiencia `citypass-residuos-api`, namespace firmado `com.citypass.residuos`.
- El 16/11 se obtuvo un **200** con la cuenta de prueba existente y el token original de Login. La respuesta contenía 1.059.600 bytes, título “Analítica CityPass+”, el bloque `citypass-datos` y las cinco cabeceras de seguridad. El token real trae `module=residuos`, `namespace=com.citypass.residuos` y `aud` escalar; el proveedor lo aceptó. No se alteran ni se vuelven a firmar claims.
- El tablero y el informe ya vienen incorporados en el HTML. No se llama a `/analytics/*`, no se insertan datos y no se accede a Blob desde Residuos.
- Prueba de navegador: el HTML real descargado se sirvió intacto desde un proveedor local con las cabeceras originales, detrás de la API con sus guards y el proxy de Vite. Se verificaron filtros (Palermo: 46 alertas frente a 432 totales), ajuste de altura, actualización de vista y limpieza de las dos cookies con DELETE 204 al actualizar y salir. Esta prueba no reemplaza la comprobación del rewrite en Render tras el despliegue.

## Sesión del iframe y autorización

El Login existente guarda su sesión en el frontend. Un iframe con `src` no puede agregar un Bearer, por lo que se crea una cookie temporal y acotada **solo para la vista del tablero**, sin cambiar el inicio de sesión de la aplicación.

1. La pantalla verifica el rol autenticado: solo `ADMINISTRADOR` y `OPERADOR`, incluido el delegado, pueden solicitar una vista. En desarrollo sin contexto de sesión se consulta `/auth/sesion`; no se autoriza con un JWT sin verificar.
2. El frontend hace **POST `/api/v1/metricas/tableros` desde su propio origen** con el Bearer vigente. Los guards de la API verifican firma, emisor, audiencia, vigencia y rol; el controller exige además identidad humana y módulo Residuos.
3. La API devuelve un id de vista y una ruta propia, y establece una cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`, sin `Domain`. Su `Path` es la ruta de **esa vista**, y dura como máximo dos minutos y nunca más que el access token. No hay sesión global nueva, refresh token ni HTML almacenado en el servidor.
4. El iframe usa esa ruta en `src`, con `sandbox="allow-scripts"` **sin** `allow-same-origin`. El middleware de esa ruta convierte la cookie en el Bearer que verifican los guards habituales. La cookie no autentica ninguna otra API.
5. La API pide el tablero al proveedor con **el mismo token humano**, sin reenviar cookies ni seguir redirecciones. Devuelve sus bytes sin modificar y conserva `Content-Type`, `Cache-Control`, `Content-Security-Policy`, `X-Content-Type-Options` y `Referrer-Policy`. Agrega `Vary: Cookie, Authorization`. Exige contenido HTML, las cabeceras del contrato y `no-store`.
6. El navegador aplica la CSP original a la respuesta del iframe. No se transforma a JSON, `srcdoc` ni Blob, mecanismos que perderían esas cabeceras. El padre no puede leer el documento aislado.
7. Al actualizar, salir de Métricas, cerrar sesión o cambiar de cuenta/rol, el componente desmonta el iframe y hace **DELETE de la ruta de esa vista** para limpiar su cookie. La limpieza no requiere una sesión vigente y nunca devuelve datos. Las vistas usan paths distintos para no pisar cookies de otras pestañas. Una respuesta tardía también se limpia y nunca vuelve a montar el tablero.

El id de vista **no es una credencial**: conocer la ruta no permite obtener el HTML sin una cookie o Bearer válidos y el rol autorizado. Ni el token de usuario ni tokens de servicio viajan en URLs.

## Errores, renovación y actualización

- El POST comparte el cliente HTTP de Login: ante `401`, renueva el access token y reintenta **una** vez; un segundo `401` invalida la sesión local.
- Si el proveedor devuelve un error durante el GET del iframe, el filtro emite una página local sin detalles del proveedor, con CSP y `no-store`. Solo avisa al padre el estado HTTP mediante `postMessage`.
- El padre exige origen opaco `"null"` y que la ventana emisora sea exactamente la del iframe actual. Un `401` permite un único POST con `{ verificar: true }`: comprueba al proveedor, usa el refresh compartido y prepara otra vista. Esa comprobación descarta los bytes; no cachea HTML.
- `403` muestra falta de acceso; `400`, `404`, `503`, timeout y errores de conexión permiten reintentar. Sin `ANALITICA_URL` se informa que falta conectar el tablero. El resto de la aplicación funciona independientemente del proveedor.
- Se mantiene el ajuste opcional de altura mediante `{ tipo: 'citypass-tablero-altura', altura }`, también verificando origen y ventana. Solo se aceptan números finitos positivos, acotados a 320–10.000 píxeles.
- Según la guía inicial del equipo, los indicadores se recalculan diariamente y el informe semanalmente. Actualizar el iframe recarga el HTML disponible; no fuerza el procesamiento de métricas.

## Mismo origen en cada entorno

- **Render:** `render.yaml` fija la URL pública confirmada en `ANALITICA_URL` de la API. En el frontend, el rewrite `/api/v1/metricas/*` apunta a la misma ruta de `citypass-residuos-api`, **antes** del fallback SPA. Debe conservar respuesta y `Set-Cookie`; verificarlo tras el deploy. La referencia oficial admite destinos URL para las reglas: https://render.com/docs/redirects-rewrites.
- **Vite local:** el proxy de `vite.config.js` toma el origen de `VITE_API_URL` o `VITE_API_ORIGIN` para las rutas de Métricas. El navegador siempre llama a su propio origen.
- **Docker Compose:** nginx reenvía `/api/v1/metricas/` hacia `api:3000`, sin caché y conservando las cabeceras. El resto de las rutas de la SPA y la API no cambia.
- El cambio requiere desplegar **back y front y aplicar el rewrite**. El job de CI dispara los builds con hooks; si no se sincroniza el Blueprint, se debe aplicar la misma regla en Redirects/Rewrites de Render. Un deploy de la SPA por sí solo no configura esa regla.
- No se necesita `VITE_BI_DASHBOARD_URL`, configurar CORS en Analítica ni cargar secretos nuevos de Login/EDA. Nunca se versionan contraseñas ni access/refresh tokens.

## Caso de eventos climáticos

Se conserva la publicación implementada y probada contra PostgreSQL: al decidir suspender zonas de una `CriticidadClimaticaConfirmada` de Espacios, Residuos publica `IntervencionActualizada` por cada parada pendiente de una ruta asignada o en curso, con `estadoNuevo=AFECTADA`, `causaTipo=EVENTO_CLIMATICO`, `causaId=alertaId`, `correlationId=alertaId` y el `camionId` de la cuadrilla. Analítica cuenta camiones distintos por alerta. No se modifican el consumo de eventos, la recuperación del servicio ni los datos de la base.

El HTML recibido el 16/11 muestra indicadores de alertas de contenedores (llenado, tipo, prioridad, resolución e informe), pero no muestra todavía el indicador de cuadrillas afectadas por clima del contrato de Parte 2. La conexión del embed está validada; queda confirmar con Analítica la publicación de ese indicador y comparar sus datos después del procesamiento. Residuos no agrega ni recalcula ese contenido dentro del HTML ajeno.

## Verificación final en Render

1. Aplicar la URL y el rewrite, desplegar back/front y entrar como administrador y delegado.
2. En Métricas, comprobar el HTML real y la CSP de la respuesta del iframe. En la red del navegador no debe haber tokens en URLs ni consultas directas a Analítica/Blob.
3. Comprobar que un chofer, una cuenta sin rol, otro namespace o una ruta sin cookie no obtienen el tablero. Salir y cambiar de cuenta deben eliminar la vista anterior.
4. Hacer una suspensión climática con una ruta asignada en la zona. Guardar el `alertaId` y las patentes publicadas en EDA. Comparar el conteo después del siguiente procesamiento de Analítica.
