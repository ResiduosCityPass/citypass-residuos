# Verificación automática del despliegue

`Deploy — Render` no termina al aceptar los hooks: espera que API y frontend sirvan el mismo
commit completo que pasó CI. La decisión y alternativas están en el
[ADR-014](../adr/ADR-014-verificacion-del-despliegue.md).

## Qué verifica

1. `main` todavía apunta al commit del workflow. Un job antiguo se omite si llegó otro push.
2. Los dos hooks aceptan `POST` con `ref=GITHUB_SHA`. Se conservan sus parámetros de autenticación.
3. API: `/api/v1/health` responde 200, `status: ok`, `service: residuos-service` y el commit esperado.
4. Frontend: `/version.json` y el `meta` de `/` identifican ese commit. El JavaScript principal
   referenciado por el HTML responde 200 con contenido JavaScript no vacío.

Cada ronda vuelve a comprobar ambos servicios. El resultado de una ronda anterior no se conserva.
Se usa `no-store` y un parámetro único para evitar respuestas cacheadas. Un fallback SPA que
devuelve HTML con 200 para un archivo faltante tampoco cuenta como éxito.

## Configuración del job

El script es `infra/desplegar-render.cjs`, requiere Node 22 o posterior y no tiene dependencias.

| Variable | Origen / valor |
|---|---|
| `GITHUB_SHA` | Commit completo del workflow, proporcionado por GitHub Actions |
| `RENDER_DEPLOY_HOOK_API`, `RENDER_DEPLOY_HOOK_FRONTEND` | Los dos secretos existentes del repositorio |
| `DEPLOY_API_URL` | `https://citypass-residuos-api.onrender.com` |
| `DEPLOY_FRONTEND_URL` | `https://citypass-residuos-frontend.onrender.com` |
| `DEPLOY_TIMEOUT_MS` | Opcional; 1.200.000 ms por defecto (20 minutos) |
| `DEPLOY_INTERVAL_MS` | Opcional; 15.000 ms por defecto |
| `DEPLOY_REQUEST_TIMEOUT_MS` | Opcional; 15.000 ms por consulta |

El workflow tiene un límite de 25 minutos y no cancela un deploy activo por otro push. No se
imprimen las URLs de hooks ni sus respuestas. El resumen de Actions distingue éxito de fallo.

No hay que cargar una variable manual con el SHA en Render: `RENDER_GIT_COMMIT` lo provee el
servicio en runtime (API) y durante el build (frontend). El Blueprint agrega `Cache-Control:
no-store` para `/version.json`, `/` e `/index.html`. El build Docker del frontend admite
`--build-arg GITHUB_SHA=<sha-completo>` y nginx aplica la misma política.

## Pruebas sin desplegar en Render

Desde la raíz:

```bash
node --test infra/*.test.cjs
```

Las pruebas HTTP levantan servidores locales y hooks simulados; nunca usan los secretos ni
modifican Render. Comprueban también el código de salida del CLI y su resumen de Actions.

Para servir los archivos reales de Vite en esas pruebas:

```bash
GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa npm --prefix frontend run build
FRONTEND_DIST="$PWD/frontend/dist" node --test infra/desplegar-render.http.test.cjs
```

En Actions se usa el `GITHUB_SHA` real. La prueba contra el build forma parte del job frontend;
el job DevOps ejecuta las pruebas del verificador y de generación de metadata.

## Si falla en producción

El log identifica API o frontend y el último problema (versión anterior, HTML viejo, archivo
faltante, HTTP o ausencia de respuesta). El job sale con código 1 al agotar el plazo. Consultar
el build y logs del servicio correspondiente en Render, corregir el problema y volver a ejecutar
el workflow solo si ese commit sigue siendo la punta de `main`. No se hace rollback automático.

Los hooks aceptados no demuestran que el despliegue haya terminado. Tampoco sirve probar esta
versión del verificador contra una aplicación antigua que todavía no publica las marcas de SHA.
