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
- ~~**Acción abierta:** coordinar con el Squad 2 el nombre exacto del claim de rol y el algoritmo de
  firma antes del Sprint 3. Responsable: Adriel.~~ **Resuelto 2026-08-26**, ver más abajo.

## Actualización 2026-08-26 — contrato del Squad 2

El Squad 2 publicó su guía de integración: [contrato de identidad](../arquitectura/contrato-identidad-token.md).
Dos supuestos de este ADR estaban equivocados:

1. **No hay un claim de rol.** El token trae `groups`: un array de grupos (ej. `["operador"]`),
   administrados desde un panel por el delegado del módulo. La traducción grupo → `Rol` interno
   vive en `backend/src/shared/auth/grupo-rol.map.ts`, no en el token. Un grupo que no reconocemos
   no otorga nada y no es un error (contrato §5) — no hay "rol por defecto".
   **Pendiente de confirmar con el delegado del panel:** que los grupos dados de alta se llaman
   exactamente `administrador`, `operador`, `chofer` (Ciudadano no lleva grupo: CU-11 es público).
   El contrato modela pertenencia a *varios* grupos por persona; nuestra matriz asume un rol único.
   Mientras no aparezca un caso real que lo necesite, se resuelve el primer grupo reconocido del
   array y se documenta como simplificación, no como decisión definitiva.
2. **El algoritmo es RS256 contra JWKS (`/.well-known/jwks.json`), no HMAC.** Esto significa que
   "apuntar al emisor real en el Sprint 3" **no es solo cambiar `JWT_ISSUER`**: hace falta resolver
   la clave de firma por `kid` contra el JWKS (típicamente con `jwks-rsa`), porque `@nestjs/jwt` no
   trae ese descubrimiento. Se corrige la frase original de este ADR ("sin tocar los guards"): sí
   hay código nuevo, acotado a la resolución de la clave — la lógica de autorización no cambia.
3. La identidad estable de una persona es `sub` (ej. `"U000042"`), nunca `preferred_username`. Si
   guardamos referencias a personas (autor de una acción, chofer que confirmó un vaciado), va `sub`.
   **Nota para Francisco:** [contratos-de-eventos.md](../arquitectura/contratos-de-eventos.md) tiene
   `choferId: "user:jperez"` en el ejemplo de `residuos.contenedor.vaciado` — con el contrato real
   ese campo debería llevar el `sub`, no el username. A revisar entre Sprint 1 y 2.
4. Los sensores no se ven afectados: el contrato de identidad cubre personas y tokens de servicio
   backend-a-backend, no dispositivos IoT. La API key por sensor (`X-Sensor-Key`) sigue como estaba.
5. El contrato define tokens de servicio (`token_use: "service"`, `client_credentials`) para cuando
   nuestro backend necesite identificarse ante otro sistema — el caso previsible es publicar en el
   bus real del Squad 1 (driver `platform` de [ADR-003](ADR-003-integracion-event-bus.md)). La regla
   del contrato es clara: la persona autoriza con su token humano, pero el evento se publica con
   *nuestro* token de servicio, llevando el `sub` de la persona como dato (`actorSub`) — nunca se
   reenvía el token humano al bus. Queda para cuando se implemente el driver `platform`.

En Sprints 1-2 seguimos firmando localmente (HS256, `JWT_SECRET`), pero el guard ya valida `iss`,
`aud`, `token_use`, `ver` y exige `exp` explícito — la misma forma que exigirá el emisor real, para
que el Sprint 3 sea el cambio quirúrgico que este ADR prometía, y no una reescritura.

## Consecuencias (actualizadas)

- **Acción abierta:** confirmar con el delegado del panel del Squad 2 los nombres exactos de los
  tres grupos (`administrador`, `operador`, `chofer`). Responsable: Adriel.
- **Acción abierta:** corregir `choferId` en `contratos-de-eventos.md` para usar `sub` en vez de
  username. Responsable: Adriel / Francisco.
- **Acción abierta (Sprint 3):** agregar resolución de clave por JWKS (`jwks-rsa` o equivalente) y
  cambiar `JWT_ALGORITHM=RS256` + `JWT_ISSUER` al emisor real. Responsable: Adriel.
