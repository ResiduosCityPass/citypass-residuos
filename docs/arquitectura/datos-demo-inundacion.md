# Datos reproducibles para la demo de inundación

El comando de Residuos prepara un escenario identificado por nombre. Funciona sin
la web de Espacios Públicos ni un token de administrador: es una herramienta de
operación ejecutada con acceso a PostgreSQL, fuera de los endpoints de la aplicación.
No modifica usuarios LDAP, roles ni grupos.

Para Render Free sin acceso externo a PostgreSQL se puede preparar el mismo tipo
de escenario con una cuenta administradora usando las APIs públicas. Ver
[ensayo operativo por HTTP](prueba-operativa-http.md). Esa alternativa valida la
patente Mercosur, registra sensores nuevos y publica los eventos normales de
lecturas y rutas; el bootstrap de base descrito aquí no publica eventos.

## Preparar en local

Desde `backend`, con dependencias instaladas y `.env.integration.local` configurado:

```bash
# Ver recursos e IDs previstos: no abre la base ni usa credenciales.
npm run demo:preparar -- --escenario CLIMA01

# Aplicar migraciones si esta base todavía no las tiene.
ENV_FILE=.env.integration.local npm run migration:run

# Crear el escenario y guardar una credencial del chofer válida por dos horas.
ENV_FILE=.env.integration.local npm run demo:preparar -- \
  --escenario CLIMA01 --apply --credencial .demo/CLIMA01.jwt
```

El nombre acepta de 1 a 10 letras/números, comienza con letra y se normaliza a
mayúsculas. Las zonas reciben UUID v4 al crearse, compatibles con la revisión
climática; sus IDs aparecen en el resultado de `--apply` y se conservan al repetir.
El plan también está disponible sin `--apply` en la imagen compilada.

| Recurso | Nombre / estado inicial |
| --- | --- |
| Zona a suspender | `DEMO-CLIMA01 Centro`, umbral 70 %, sin bloqueo manual |
| Zona de control | `DEMO-CLIMA01 Norte`, sin bloqueo manual |
| Contenedor 01 | `DEMO-CLIMA01-01`, Centro, COMUN, CRITICO, 90 % |
| Contenedor 02 | `DEMO-CLIMA01-02`, Centro, COMUN, NORMAL, 30 % |
| Contenedor 03 | `DEMO-CLIMA01-03`, Norte, COMUN, CRITICO, 85 % |
| Camión | `DEMO-CLIMA01`, COMUN, capacidad 10.000 L, EN_RUTA |
| Chofer | `SIMULACRO CLIMA01`, legajo `DEMO-CLIMA01`, activo |
| Ruta inicial | ASIGNADA al chofer; una parada PENDIENTE en el contenedor 01 |

El contenedor 01 está en `-34.6037, -58.3816`; el 02 en `-34.604, -58.382` y el
control en `-34.5631, -58.4584`. Son datos sintéticos alrededor de puntos de CABA.
Los IDs, estados y nombres se imprimen como JSON, sin secretos ni el sub del chofer.

La carga inicial es un bootstrap de prueba: **no publica RutaGenerada, RutaAsignada
ni eventos climáticos**. No arranca Nest, Kafka o el dispatcher, no crea una alerta
ficticia recibida y no necesita las credenciales del servicio EDA. Las acciones
posteriores realizadas desde la aplicación sí siguen el dominio y el outbox normales.

## Repetir sin borrar evidencia

```bash
# Solo consulta/conserva el escenario existente; no repone los llenados.
ENV_FILE=.env.integration.local npm run demo:preparar -- --escenario CLIMA01 --apply

# Para otra demostración, elegir otro nombre.
ENV_FILE=.env.integration.local npm run demo:preparar -- \
  --escenario CLIMA02 --apply --credencial .demo/CLIMA02.jwt
```

La creación es transaccional y usa el mismo lock de operación que ruteo e inundaciones.
Dos ejecuciones simultáneas crean una sola copia. Una repetición conserva llenados,
paradas confirmadas, rutas completadas, bloqueos manuales y el sub de sesión existente.
Si faltan recursos de un escenario o fueron reasignados, el comando falla y no lo
reconstruye. Una colisión de código o nombre revierte toda la creación.

La credencial se guarda con permisos `0600`, no se imprime, no sobrescribe archivos
y no rota el acceso existente. Para obtener otra al vencer, repetir con una ruta de
salida nueva, por ejemplo `.demo/CLIMA01-2.jwt`. Solo permite las acciones del chofer
interno de ese escenario. La carpeta `.demo/` está ignorada por Git y Docker.

## Recorrer el caso de uso

1. Entrar a Residuos con Login federado y abrir `/chofer` en otra pestaña. Pegar allí
   el contenido del archivo de credencial, sin publicarlo ni compartirlo en el bus.
2. Confirmar que la ruta inicial tiene el contenedor 01 pendiente al 90 %.
3. Cuando llegue una alerta nueva por EDA, revisar la afectación y seleccionar
   **DEMO-CLIMA01 Centro**, no las zonas de los ensayos anteriores.
4. Comprobar la suspensión de la parada y que el contenedor 02 al 30 % queda incluido
   en el trabajo pendiente de recuperación. Norte conserva su 85 %.
5. Finalizar el mismo `alertaId` desde Espacios Públicos; verificar recuperación
   pendiente y luego habilitarla como operador.
6. Confirmar el vaciado del 01. Después generar otra ruta con el mismo camión,
   filtrando **DEMO-CLIMA01 Centro**: debe incluir el 02 aunque no esté crítico.
7. Asignar esa ruta al mismo chofer y confirmar el segundo vaciado. Verificar
   RECUPERADA y `ServicioRestablecido` en EDA.

En una computadora sin ubicación real de CABA se puede usar la simulación GPS del
perfil **local de desarrollo**. El Blueprint de producción la deja deshabilitada.
El comando de datos no modifica ese ajuste.

## Imagen de producción y base cloud

El CLI compilado está incluido en la imagen; no depende de `ts-node`:

```bash
docker run --rm citypass-residuos-api:integracion-preparada \
  npm run demo:preparar:prod -- --escenario CLIMA01
```

Para preparar la base desplegada desde una computadora autorizada, crear el archivo
ignorado `backend/.env.demo.cloud.local` con `DATABASE_URL` externa de esa base,
`DB_SSL=true` y, si se pide credencial, `JWT_SECRET`, `JWT_ISSUER_CHOFERES` y
`JWT_AUDIENCE` iguales a los del backend desplegado. No copiar secretos de EDA al
frontend. Elegir un nombre nuevo para cada ensayo.

```bash
mkdir -p backend/.demo
docker run --rm --user "$(id -u):$(id -g)" --env-file backend/.env.demo.cloud.local \
  -v "$PWD/backend/.demo:/demo" citypass-residuos-api:integracion-preparada \
  node dist/scripts/preparar-demo.js --escenario CLIMA01 --apply --credencial /demo/CLIMA01.jwt
```

Este comando escribe solamente los recursos DEMO del escenario solicitado en la
base indicada. Las migraciones deben estar aplicadas previamente. No se ejecuta
automáticamente durante builds ni al arrancar el servidor.
`--user` conserva el propietario del archivo de credencial en el directorio montado.

Para volver a probar publicando nuestros tipos de simulacro se usa el perfil local
de desarrollo y [el CLI de EDA](simulacro-clima-eda.md). Esos tipos continúan apagados
en producción; preparar datos no los habilita.
