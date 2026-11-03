# Preparación de despliegue con Login y EDA — 02/11/2026

## Cambios preparados

- `render.yaml`: Login federado en backend/frontend, JWKS y roles confirmados,
  publicación por `platform`, consumidor Kafka con TLS y grupo cloud separado del
  local. Simuladores climáticos, mocks y GPS simulado apagados en producción.
- `JWT_SECRET` se conserva como secreto de choferes; `EDA_CLIENT_SECRET` se declara
  como secreto externo con `sync: false`. No hay credenciales del servicio en el frontend.
- CI verifica el Blueprint con el validador real de la aplicación y comprueba su
  coherencia con el frontend. El build Docker de frontend también usa Login federado.
- El CLI de migraciones respeta `ENV_FILE`. Se habilitaron hooks de cierre de Nest
  para que SIGTERM alcance Kafka y el dispatcher durante el reemplazo del contenedor.
- Se corrigió el lockfile: faltaba el peer opcional `diff@9.0.0` de `mappersmith`.
  `npm ci` ahora funciona dentro de Node 22 Alpine, incluyendo `--omit=dev`.
- Se incorporó el comando `demo:preparar`, con plan sin conexión y ejecución compilada
  en la imagen. Crea datos sintéticos y una ruta inicial asignada, sin publicar eventos.

No se sincronizó el Blueprint remoto, no se publicaron imágenes ni se dispararon
deploy hooks. Los cambios siguen disponibles en el workspace para revisión.

## Validación

| Comprobación | Resultado |
| --- | --- |
| Backend unitario | 569 tests, 60 suites, correctos |
| Cobertura unitaria de líneas backend | 90,39 %, superior al umbral 60 % |
| E2E con PostgreSQL migrado | 118 tests, 13 suites, correctos |
| Lint, tipado y compilación backend | Correctos |
| Blueprint y coherencia Login/EDA/frontend | Correctos, sin red ni secretos reales |
| Imagen backend | Build limpio con dependencias de producción |
| Imagen frontend federada | Build correcto; nginx valida configuración y responde health |
| Arranque del contenedor backend | `NODE_ENV=production`, `AUTH_MODE=federated`, driver `platform`; health correcto |
| Esquema de la base Docker descartable | Nueve migraciones aplicadas |
| Login real del delegado en esa imagen | JWT aceptado, rol OPERADOR; logout real HTTP 204 |
| CLI compilado y chofer | Escenario creado, ruta consultada con credencial interna válida |
| Repetición de la carga | Mismos IDs y estados, sin duplicación ni reposición de llenados |
| Archivo de credencial | Permisos 0600; salida montada conserva propietario del host |
| Cierre por SIGTERM | Salida 143, sin SIGKILL |

Se añadieron unitarios de validación de escenario y credenciales, y E2E de concurrencia,
conservación de vaciados/bloqueos/sesión, rollback ante colisiones y detección de recursos
incompletos o reasignados. Otro E2E ingresa una alerta por el receptor EDA, selecciona
la zona UUID v4 de la demo desde el endpoint real y comprueba la suspensión y el rechazo
de vaciado. Los E2E usan la base separada de tests, sin publicar en EDA compartido.

Las zonas de demo usan UUID v4 como exige la revisión climática. Los demás IDs se
obtienen de un namespace UUID v5 específico del escenario; no son credenciales.
El sub del chofer es aleatorio y se conserva al repetir. No se relajó la validación
del contrato climático para acomodar datos de prueba.

Los contenedores Docker y su base de smoke son descartables y se retiraron al terminar.
Las imágenes locales se conservaron con tag `integracion-preparada`. Los datos de los
ensayos anteriores de Residuos no se modificaron.

## Límite de la comprobación de Kafka

Durante esta preparación, OAuth y catálogo respondieron, pero el broker oficial
`test.citypass.mrfranco.net.ar:9092` volvió a cortar la conexión **antes de completar
TLS**, tanto desde el host como desde Docker. El contenedor informó ese error en
Eventos climáticos. No se deshabilitó TLS ni se cambiaron certificados, DNS o puertos.

Por eso no se afirma una nueva conexión Kafka exitosa desde la imagen. Este fallo
de conectividad es independiente del problema anterior de publicación desde Espacios
Públicos. La prueba completa de Residuos por EDA que sí se realizó antes sigue
[documentada por separado](../arquitectura/prueba-eda-real-2026-11-02.md).

Para el smoke se usó una base Docker aislada, un grupo Kafka exclusivo con prefijo de
Residuos y `fromBeginning=false`. No se leyeron históricos de otros equipos ni se
publicaron eventos de negocio. La sesión humana de comprobación se cerró al terminar.

## Datos locales listos para continuar

En `residuos_integracion_real_demo` quedó el escenario **LISTO01**:

- Zona afectable: **DEMO-LISTO01 Centro**; control: **DEMO-LISTO01 Norte**.
- Contenedores 01/02/03 en 90 %, 30 % y 85 %.
- Camión `DEMO-LISTO01`, chofer `SIMULACRO LISTO01`, ruta inicial ASIGNADA.
- Credencial del chofer en `backend/.demo/LISTO01.jwt`, ignorada, privada y temporal.

Para consultar/conservar ese escenario desde `backend`:

```bash
ENV_FILE=.env.integration.local npm run demo:preparar -- --escenario LISTO01 --apply
```

La [guía de datos](../arquitectura/datos-demo-inundacion.md) explica cómo crear otro
escenario, renovar la credencial con otro archivo y recorrer la demo.

## Pasos pendientes al publicar

1. Cargar manualmente `EDA_CLIENT_SECRET` en el backend Render existente y conservar
   su `JWT_SECRET`. `sync: false` no agrega secretos nuevos a un Blueprint existente.
2. Publicar los cambios revisados mediante el flujo de CI/deploy del proyecto.
3. Confirmar migraciones, health, login federado y **Kafka conectado** desde el entorno
   desplegado; el health de base por sí solo no certifica EDA.
4. Preparar un escenario nuevo en esa base con el CLI y comprobar una alerta nueva
   de Espacios Públicos, manteniéndola activa hasta verificar la suspensión.

Ver [operación del despliegue](despliegue-backend.md) y
[evidencia estructurada sin secretos](../evidencias/despliegue-login-eda-2026-11-02.json).
