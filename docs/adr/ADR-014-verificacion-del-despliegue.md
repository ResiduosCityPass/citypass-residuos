# ADR-014 — Verificar la versión publicada después del deploy

- **Estado:** Propuesto, implementado en la rama para revisión
- **Fecha:** 2026-11-19
- **Complementa:** [ADR-008](ADR-008-destino-cloud.md)

## Contexto

El job de deploy confirmaba que Render aceptara sus hooks, pero podía terminar en verde con el
build todavía pendiente o fallido y la versión anterior atendiendo requests. API y frontend se
publican por separado. Un HTTP 200 no demuestra que se haya publicado el commit validado por CI.

## Opciones consideradas

| Opción | Ventajas | Límites |
|---|---|---|
| Revisar Render manualmente | Sin cambios de implementación | El job no detecta fallos y depende de una persona |
| Consultar el estado del deploy con la API de Render | Permite distinguir un build en curso de uno fallido | Necesita otra credencial; un estado exitoso no prueba el contenido servido a los usuarios |
| Consultar versión y archivos públicos de ambos servicios (elegida) | Comprueba el commit servido y utiliza los secretos de hooks existentes | Si el build falla, se informa por timeout; el motivo detallado se consulta en Render |

## Decisión

- El job de producción se ejecuta después de CI y se serializa con `concurrency`. Antes de
  desplegar, omite los commits superados por otro push a `main`.
- Ambos hooks llevan `ref=GITHUB_SHA`, el mecanismo oficial de Render para publicar un commit
  concreto: [Deploy Hooks](https://render.com/docs/deploy-hooks#deploying-a-specific-git-commit).
- `/api/v1/health` informa `RENDER_GIT_COMMIT`. Se exige HTTP 200, servicio correcto, estado `ok`
  y coincidencia exacta del SHA completo.
- Vite incluye el SHA del proveedor en `/version.json` y en un `meta` del HTML. Se comprueban
  ambos, además del JavaScript principal referenciado por ese HTML. El SHA es público; los
  secretos nunca forman parte de estos archivos.
- El verificador consulta sin caché cada 15 segundos, hasta 20 minutos. Solo informa éxito cuando
  los dos servicios pasan en la misma ronda. Errores transitorios, versiones viejas y arranques en
  frío se reintentan; un timeout termina el job con error.

## Consecuencias

- No se agregan secretos ni se ejecutan escrituras en las APIs del dominio durante la verificación.
- Los hooks se disparan una sola vez por ejecución, sin reintentar automáticamente un POST cuyo
  resultado sea incierto, para evitar encolar despliegues duplicados.
- Render y nginx sirven la marca de versión y el HTML sin caché. Los bundles conservan sus nombres
  con hash y la política de caché estática.
- Un build local sin SHA informa `null`; no puede acreditar un despliegue productivo. Render debe
  proporcionar su revisión; en Actions y Docker se utiliza `GITHUB_SHA`.
- Las pruebas cubren transiciones de versiones, fallos y el comando completo por HTTP. El job del
  frontend también ejecuta esa prueba contra los archivos reales producidos por Vite.
- Esto verifica publicación y disponibilidad de los archivos de entrada, no reemplaza pruebas de
  interacción de navegador ni un monitoreo continuo. No realiza rollback automático.

Operación y comandos: [verificación del despliegue](../devops/verificacion-despliegue.md).
