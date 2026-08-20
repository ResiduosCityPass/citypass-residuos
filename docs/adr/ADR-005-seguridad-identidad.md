# ADR-005 — Seguridad e identidad federada

- **Estado:** Aceptado
- **Fecha:** 2026-08-20
- **Decisores:** Squad 4 (Adriel Pasik, Francisco Isola)

## Contexto

El enunciado establece que *"el login centralizado debe proteger todos los endpoints"*. La emisión
de identidad es responsabilidad del Squad 2 (LDAP + JWT), que al 20/08 aún no publicó su emisor ni
la clave de verificación. Nuestro módulo tiene cuatro actores humanos con permisos claramente
distintos: Administrador, Operador, Chofer y Ciudadano.

Existe además un actor no humano: el **sensor**, que llama a `POST /lecturas` cada 15 minutos y no
puede atravesar un flujo de login interactivo.

## Opciones consideradas

### A. Autenticación propia del módulo
- **En contra:** contradice el requisito de login centralizado y duplica la responsabilidad del Squad 2.

### B. Validación de JWT contra el emisor del Squad 2, sin alternativa local
- **A favor:** es el objetivo final.
- **En contra:** hasta que el Squad 2 publique su emisor no podríamos ni probar los endpoints,
  y eso bloquea los sprints 1 y 2.

### C. Verificación de JWT con emisor configurable y perfil de desarrollo  (elegida)

## Decisión

- Guard global de JWT: **todo endpoint está protegido salvo que se marque explícitamente** con el
  decorador `@Public()`. La protección es el default; la excepción es deliberada y visible en el código.
- Autorización por roles mediante `@Roles(Rol.OPERADOR, ...)`, leyendo el claim de rol del token.
- La clave o JWKS de verificación se resuelve por configuración (`JWT_SECRET` / `JWT_ISSUER_URL`).
  Durante los sprints 1 y 2 se firma localmente; en el Sprint 3 se apunta al emisor del Squad 2
  **sin tocar código**.
- Los sensores **no** usan JWT de usuario: se autentican con una API key por dispositivo
  (header `X-Sensor-Key`), validada por un guard propio. Un dispositivo IoT no tiene sesión de
  usuario y no debería portar un token con claims de persona.

## Matriz de autorización

| Recurso | Administrador | Operador | Chofer | Ciudadano | Sensor |
|---|---|---|---|---|---|
| Contenedores — alta, baja, edición | Sí | — | — | — | — |
| Contenedores — lectura | Sí | Sí | Sí | Sí (vista pública) | — |
| Zonas y umbrales | Sí | — | — | — | — |
| Flota | Sí | Sí (lectura) | — | — | — |
| Lecturas — alta | — | — | — | — | Sí |
| Alertas | Sí | Sí | — | — | — |
| Rutas — generar y asignar | Sí | Sí | — | — | — |
| Rutas — ver la propia | Sí | Sí | Sí | — | — |
| Confirmar vaciado | — | — | Sí | — | — |

## Consecuencias

- El endpoint de consulta ciudadana (CU-11) se marca `@Public()`: es información de servicio público
  y exigir login ahí sería una barrera sin justificación. Queda documentado como decisión, no como olvido.
- Las API keys de sensores se almacenan hasheadas, nunca en texto plano.
- **Acción abierta:** coordinar con el Squad 2 el nombre exacto del claim de rol y el algoritmo de
  firma antes del Sprint 3. Responsable: Adriel.
