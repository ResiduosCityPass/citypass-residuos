# ADR-013 — Endpoints fuera del login federado

- **Estado:** Aceptado
- **Fecha:** 2026-11-18
- **Decisores:** Squad 4
- **Complementa:** [ADR-005](ADR-005-seguridad-identidad.md) y
  [ADR-009](ADR-009-identidad-de-los-choferes.md)

## Contexto

El enunciado exige que *"el login centralizado debe proteger todos los endpoints"*. El
[ADR-005](ADR-005-seguridad-identidad.md) lo implementó con un guard global (`JwtAuthGuard` +
`RolesGuard` como `APP_GUARD`): **todo endpoint de un controller exige un JWT válido salvo que
esté marcado con `@Public()`**. Los tokens humanos se verifican con RS256 contra el JWKS del Login
(Grupo 2), validando emisor, audiencia y módulo.

Desde ese ADR se sumaron módulos (integración, Analítica, clima) y algunas llamadas que no vienen
de una persona con sesión. Este ADR deja en un solo lugar **qué endpoints no usan el JWT humano de
Login Federado, por qué, y qué los protege en su lugar**. Así una excepción es una decisión
revisable y no un descuido.

Documentar una excepción acá no equivale a que la cátedra la haya aceptado. Esa aprobación se
pide aparte y queda registrada en la sección [Aprobación](#aprobación).

## Opciones consideradas

### A. Exigir el JWT humano de Login Federado en todos los endpoints, sin excepciones
- **A favor:** cumple el enunciado al pie de la letra.
- **En contra:** hay llamadores que no pueden tener ese token:
  - Un sensor IoT no tiene usuario ni sesión.
  - El dispatcher del gateway del Squad 1 no manda token.
  - El healthcheck de Render no se autentica.
  - Borrar la cookie del tablero tiene que funcionar aunque la sesión ya haya vencido.

  Forzarlo obligaría a darles a esas máquinas credenciales de persona, que es peor.

### B. Login Federado como default, con excepciones enumeradas y otra protección  (elegida)
- **A favor:** operadores y administradores entran siempre por Login Federado. Las llamadas de
  máquina usan una credencial propia de máquina. Hay dos excepciones con personas: los vecinos
  consultan CU-11 sin cuenta y los choferes usan una identidad interna del módulo (ver abajo).
  Cada excepción está marcada en el código con `@Public()` o descrita acá.
- **En contra:** hay que mantener este inventario. Se revisa cada vez que aparece un `@Public()`.

## Decisión: inventario de excepciones

### Endpoints de controllers marcados con `@Public()`

Son **cinco**. Para listarlos: `grep -rn "@Public()" backend/src --include=*.controller.ts`.

| Endpoint | Quién lo llama | Qué lo protege en lugar del JWT humano |
|---|---|---|
| `GET /health` | Healthcheck de Render | Nada que proteger: no expone datos del dominio |
| `POST /lecturas` (CU-04) | Sensores IoT | `SensorKeyGuard`: API key por dispositivo en `X-Sensor-Key`, guardada hasheada ([ADR-005](ADR-005-seguridad-identidad.md)) |
| `POST /webhooks/citypass` | Dispatcher del gateway del Squad 1 | Secreto de la suscripción (`GATEWAY_WEBHOOK_TOKEN`) comparado en tiempo constante. La vía principal, Kafka, sí usa una credencial de Login (`client_credentials`) ([ADR-010](ADR-010-integracion-real-con-el-bus.md)) |
| `DELETE /metricas/tableros/:vistaId` | Frontend, al salir de Métricas | Solo borra la cookie de esa vista y no devuelve datos. Tiene que andar con la sesión vencida ([ADR-011](ADR-011-tablero-de-analitica-embebido.md)) |
| `GET /publico/contenedores/cercanos` (CU-11) | Vecinos | Es información de servicio público: ubicación y tipo de contenedor. **No expone** nivel de llenado, estado ni alertas |

### Fuera de los controllers: Swagger

`SwaggerModule.setup('docs', …)` en `main.ts` publica la documentación por fuera del guard global,
porque no es un controller. Hoy responde sin login también en producción.

| Ruta | Qué expone | Riesgo |
|---|---|---|
| `GET /docs` | La interfaz de Swagger | Muestra el contrato de la API: rutas, DTOs y códigos de error. No devuelve datos del dominio, y usar cualquier endpoint protegido desde ahí sigue pidiendo un token |
| `GET /docs-json` | La definición OpenAPI en JSON | El mismo contrato, en formato legible por máquina |

Es una decisión pendiente, no una excepción aceptada. Lo habitual es apagarlo en producción o
pedirle login. No se cambia antes de las presentaciones porque se usa para mostrar la API en la
demo.

### CU-11, la excepción con un vecino del otro lado

La decisión del ADR-005 se mantiene: exigir una cuenta para saber dónde tirar unas pilas es una
barrera sin beneficio, y Login Federado no tiene un grupo de ciudadanos para Residuos
(`grupo-rol.map.ts`). Si la cátedra lo exige, el cambio está acotado a tres pasos:

1. Quitar `@Public()` y agregar `@Roles(Rol.CIUDADANO)`.
2. Mapear el grupo de ciudadanos que defina Login.
3. Pedir el login en la pantalla del vecino.

### Choferes: autenticados, pero fuera del proveedor centralizado

Su token lo emite este módulo, no Login Federado ([ADR-009](ADR-009-identidad-de-los-choferes.md)).
Pasa por el mismo guard global, que verifica firma, emisor (`JWT_ISSUER_CHOFERES`) y rol, y no hay
endpoints abiertos para choferes. Aun así, es una **excepción al login centralizado**: la
identidad del chofer no la administra el proveedor de la plataforma.

### Lo que no es una excepción
- **`GET /metricas/tableros/:vistaId`.** La cookie se convierte en Bearer antes de los guards, así
  que se verifica igual que cualquier token humano.
- **`GET /auth/sesion`.** No tiene `@Roles()`, pero exige un JWT válido.

## Consecuencias

- La protección sigue siendo el default: un endpoint nuevo nace protegido, y abrirlo requiere
  escribir `@Public()` a propósito.
- Este inventario reemplaza la frase del ADR-005 que decía que CU-11 era el único endpoint público.
- Cualquier `@Public()` nuevo se agrega a esta tabla en el mismo PR, con quién lo llama y qué lo
  protege.

## Aprobación

| Excepción | Estado con la cátedra |
|---|---|
| Endpoints de máquina (`/health`, `/lecturas`, webhook, borrar la cookie del tablero) | Pendiente de confirmar |
| CU-11 sin login | Pendiente de confirmar |
| Choferes con identidad interna | Pendiente de confirmar |
| Swagger público | Decisión pendiente del equipo |

Cuando la cátedra responda, se anota acá la fecha y el medio.
