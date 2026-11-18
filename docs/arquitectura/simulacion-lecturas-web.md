# Lecturas de prueba desde el detalle del contenedor

Esta herramienta permite preparar un contenedor para una prueba sin comandos ni claves IoT
en el navegador. Requiere una sesión con rol **ADMINISTRADOR**; no se ofrece a operadores o
choferes y la API también exige ese rol.

## Uso

1. En **Contenedores**, abrir el detalle del contenedor.
2. Si todavía no tiene sensor, vincular uno desde el listado. La simulación no crea sensores
   ni cambia sus credenciales. Si está fuera de servicio, reintegrarlo primero.
3. Elegir **Simular lectura** e indicar un porcentaje entre 0 y 100 (hasta dos decimales).
4. Revisar el aviso y marcar la confirmación. Cambiar el porcentaje invalida esa confirmación.
5. Pulsar **Confirmar y registrar lectura**. El detalle, las alertas, su contador y la predicción
   se recargan. Durante el envío se bloquean el cierre y los envíos repetidos.

La lectura se guarda realmente en el historial y usa la misma ingesta transaccional que el
sensor: puede modificar el estado, generar alertas y escribir eventos en el outbox. Por ejemplo,
90% con umbral 70% produce un contenedor crítico elegible para rutas, si las demás restricciones
lo permiten. No se crean reglas de llenado paralelas.

Se conservan la temperatura y batería actuales. Si nunca fueron informadas, se usan 20 °C y
100%, respectivamente, visibles en el formulario. Se usa la hora del servidor y se mantiene el
rechazo de lecturas fuera de orden. Una simulación exitosa deja un log `LECTURA_SIMULADA` con
el usuario autenticado (`actorSub`), contenedor, lectura, porcentaje y resultado, sin credenciales.

**Simular 0% no confirma un vaciado ni termina una recuperación climática.** El chofer debe
completar ese paso desde su ruta. Las suspensiones, bloqueos y asignaciones se conservan.

## API

`POST /api/v1/contenedores/:id/lecturas/simulacion`, con JWT humano administrador:

```json
{ "nivelLlenadoPct": 90, "confirmar": true }
```

- `202`: resultado habitual de ingesta (`lecturaId`, `contenedorId`, estados y alertas).
- `400`: UUID/cuerpo inválido, falta confirmación o campos adicionales (no acepta sensor,
  credenciales, temperatura, batería ni fecha elegidos por el cliente).
- `401`/`403`: falta de sesión o rol. `X-Sensor-Key` no autoriza este endpoint.
- `404`: contenedor inexistente o dado de baja.
- `409`: contenedor sin sensor, fuera de servicio o lectura fuera de orden.

`POST /lecturas` conserva la autenticación IoT y su comportamiento anterior. No hay migraciones,
variables nuevas ni cambios de esquemas EDA. La simulación requiere el backend real; el modo de
mocks no simula una publicación al bus. En el perfil local el detalle consulta `/auth/sesion`
para verificar el rol; en el federado reutiliza la sesión verificada por Login.
