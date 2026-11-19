# ADR-011 — Tablero de Analítica embebido en la aplicación

- **Estado:** Aceptado
- **Fecha:** 2026-11-18. Registra la decisión implementada con el contrato del 16/11.
- **Decisores:** Squad 4

## Contexto

Analítica (Grupo 8) arma el tablero de métricas de cada módulo, y Residuos tiene que mostrarlo
**dentro de su propia aplicación**. El contrato del 16/11 (`integración-analitica.md`) define:

- `GET /embed/residuos` en la base de producción de Analítica. Devuelve un HTML completo con los
  datos incorporados.
- Exige `Authorization: Bearer <access token humano>` de Login Federado, del módulo Residuos.
- La respuesta trae sus propias cabeceras de seguridad: `Content-Security-Policy`,
  `Cache-Control: no-store`, `X-Content-Type-Options` y `Referrer-Policy`.

El problema es que **un `<iframe src>` no puede mandar un header `Authorization`**, y el token del
usuario vive en el frontend.

## Opciones consideradas

### A. Iframe apuntando a Analítica con el token en la URL
- **A favor:** no hay que escribir código en el backend.
- **En contra:** el token humano queda en logs, en el historial y en el `Referer`. Viola la regla
  de no poner credenciales en URLs. Además, el contrato no acepta el token por query.

### B. El frontend descarga el HTML y lo inyecta con `srcdoc` o un Blob
- **A favor:** no hace falta backend y el token viaja en el header.
- **En contra:** la CSP y el resto de las cabeceras de Analítica se pierden, porque el navegador
  solo las aplica a una respuesta HTTP. Además, haría falta CORS en Analítica.

### C. Reconstruir las métricas en nuestro frontend con las APIs de Analítica
- **A favor:** control total del diseño.
- **En contra:** duplica el trabajo de BI y se aparta del contrato, que entrega HTML. Las métricas
  quedarían definidas en dos lugares.

### D. Proxy del mismo origen en nuestra API, con una cookie de vista de corta duración  (elegida)
- **A favor:** el token nunca viaja en una URL. El navegador recibe la respuesta original con sus
  cabeceras, así que aplica la CSP de Analítica. Los guards de siempre (firma, emisor, audiencia,
  vigencia y rol) deciden quién ve el tablero.
- **En contra:** hay más piezas: un endpoint para crear la vista, una cookie y un rewrite en Render
  para que todo quede en el mismo origen.

## Decisión

1. El frontend hace `POST /api/v1/metricas/tableros` con el Bearer vigente. Solo pasan
   `ADMINISTRADOR` y `OPERADOR`, con identidad humana y módulo `residuos`.
2. La API devuelve un id de vista y fija una cookie `HttpOnly`, `SameSite=Strict` y `Secure` en
   producción. Su `Path` es solo la ruta de esa vista, y dura dos minutos como máximo, nunca más
   que el token.
3. El iframe carga esa ruta. Un middleware convierte la cookie en el Bearer que verifican los
   guards. La API pide el HTML a Analítica con el mismo token humano y lo devuelve sin modificarlo,
   con las cabeceras originales.
4. Al salir de la pantalla, actualizar o cerrar sesión, el frontend hace `DELETE` de la vista para
   borrar la cookie. Esa ruta no devuelve datos, por eso no exige sesión
   (ver [ADR-013](ADR-013-endpoints-fuera-del-login-federado.md)).
5. En Render, el sitio estático reescribe `/api/v1/metricas/*` hacia la API para mantener el mismo
   origen ([`render.yaml`](../../render.yaml)).

## Consecuencias

- No se crea una sesión global nueva, no se guarda HTML en el servidor y no hay secretos nuevos.
- El iframe usa `sandbox="allow-scripts"` sin `allow-same-origin`, así que la página padre no puede
  leer el documento de Analítica. La única comunicación es un `postMessage` para el alto y el estado
  HTTP, que se valida por origen y por ventana emisora.
- Si Analítica falla, el filtro del iframe muestra una página local sin detalles del proveedor. El
  resto de la aplicación funciona igual.
- Las métricas las define cada módulo (criterio del docente del 12/11). Residuos no recalcula ni
  modifica el contenido del tablero.
- El flujo completo y su verificación están en
  [tablero-analitica.md](../arquitectura/tablero-analitica.md).
