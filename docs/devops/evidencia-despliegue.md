# Evidencia de despliegue cloud

Evidencia del despliegue del modulo de Residuos en Render, usando la infraestructura declarada en
[`render.yaml`](../../render.yaml).

## Resumen

| Item | Valor |
|---|---|
| Proveedor cloud | Render |
| Blueprint | `citypass-residuos` |
| Branch desplegada | `main` |
| Commit verificado | `9135bf8` - `ci(devops): document Render auto deploy stage` |
| Fecha de verificacion | 2026-09-04 21:39 ART |
| Responsable | Ramiro Souto |

El `JWT_SECRET` esta configurado como secreto en Render y no se documenta en el repositorio.

## Recursos creados

| Recurso | Tipo | URL / nombre |
|---|---|---|
| Frontend | Static site | `https://citypass-residuos-frontend.onrender.com` |
| Backend API | Web service Docker | `https://citypass-residuos-api.onrender.com` |
| PostgreSQL | Managed database | `citypass-residuos-db` |

La base PostgreSQL gratuita informa vencimiento el **2026-10-04**. Render indica que la base sera
eliminada si no se actualiza a un plan pago antes del vencimiento.

## Paquete para mostrar en el Hito 1

Usar esta seccion como checklist de la parte DevOps de la demo.

| Evidencia | Link / comando | Que demuestra |
|---|---|---|
| Frontend publicado | <https://citypass-residuos-frontend.onrender.com> | La SPA esta desplegada y accesible |
| API publicada | <https://citypass-residuos-api.onrender.com/api/v1/health> | El backend esta vivo en Render |
| Swagger | <https://citypass-residuos-api.onrender.com/docs> | La API expone documentacion navegable |
| Endpoint publico | `curl -i "https://citypass-residuos-api.onrender.com/api/v1/publico/contenedores/cercanos?lat=-34.6037&lng=-58.3816&radioMetros=1500"` | API + PostgreSQL + esquema |
| Endpoint privado | `curl -i https://citypass-residuos-api.onrender.com/api/v1/contenedores` | Los guards rechazan requests sin token |
| CI/CD | <https://github.com/ResiduosCityPass/citypass-residuos/actions/runs/33933590708> | Backend, frontend, Docker y deploy-info en verde |
| IaC | [`render.yaml`](../../render.yaml) | La infraestructura esta declarada como codigo |

### Capturas sugeridas

- GitHub Actions con el run `33933590708` en verde.
- Job `Docker — build de imagenes` mostrando backend y frontend OK.
- Job `Deploy — Render auto deploy` mostrando el resumen de URLs.
- Blueprint `citypass-residuos` en Render con API, frontend y DB creados.
- API health en navegador con `status: ok`.
- Frontend abierto en `https://citypass-residuos-frontend.onrender.com`.
- Pantalla de la DB mostrando vencimiento `2026-10-04`.

### Mini guion DevOps

> "El despliegue esta definido como infraestructura como codigo en `render.yaml`. GitHub Actions
> valida backend, frontend y las imagenes Docker. Cuando `main` queda en verde, Render despliega
> automaticamente por `autoDeployTrigger: checksPass`. La API, el frontend y PostgreSQL estan
> creados desde el Blueprint, sin configuracion manual dentro del codigo."

## CI en `main`

La rama `main` quedo sincronizada desde `develop` y el pipeline de CI/CD quedo verificado en el
commit `9135bf8`.

Workflow verificado:

- CI run: <https://github.com/ResiduosCityPass/citypass-residuos/actions/runs/33933590708>
- Backend: lint, build, migraciones, cobertura y tests de integracion en verde.
- Frontend: lint, build y tests con cobertura en verde.
- Docker: build de imagen backend y frontend en verde.
- Deploy-info: verificacion de Blueprint y resumen de URLs en verde.

## CD hacia Render

El deploy productivo se gestiona con el Blueprint de Render declarado en `render.yaml`.

El workflow `CI` incluye un job final `Deploy — Render auto deploy`, que corre solo en pushes a
`main` despues de que backend, frontend y Docker terminan correctamente. Ese job deja visible en
GitHub Actions la URL de la API, la URL del frontend y la politica de deploy.

Render es quien dispara el despliegue real porque los servicios tienen
`autoDeployTrigger: checksPass`: cuando los checks de GitHub pasan sobre `main`, Render despliega la
nueva revision.

## Chequeos del despliegue

### Health de la API

```bash
curl -i https://citypass-residuos-api.onrender.com/api/v1/health
```

Resultado observado:

```http
HTTP/2 200
```

```json
{
  "status": "ok",
  "service": "residuos-service"
}
```

### API + PostgreSQL + esquema

```bash
curl -i "https://citypass-residuos-api.onrender.com/api/v1/publico/contenedores/cercanos?lat=-34.6037&lng=-58.3816&radioMetros=1500"
```

Resultado observado:

```http
HTTP/2 200
```

```json
[]
```

La respuesta vacia indica que la API responde, llega a PostgreSQL y el esquema existe. Falta cargar
datos de demo para que el endpoint devuelva contenedores.

### Swagger

```bash
curl -I https://citypass-residuos-api.onrender.com/docs
```

Resultado observado:

```http
HTTP/2 200
```

### Frontend

```bash
curl -I https://citypass-residuos-frontend.onrender.com
```

Resultado observado:

```http
HTTP/2 200
```

La app fue abierta manualmente en el navegador y cargo correctamente.

### CORS entre frontend y API

```bash
curl -i \
  -H "Origin: https://citypass-residuos-frontend.onrender.com" \
  "https://citypass-residuos-api.onrender.com/api/v1/publico/contenedores/cercanos?lat=-34.6037&lng=-58.3816&radioMetros=1500"
```

Resultado observado:

```http
HTTP/2 200
access-control-allow-origin: https://citypass-residuos-frontend.onrender.com
```

Esto verifica que el backend acepta requests del frontend publicado y no queda con CORS abierto a
cualquier origen en produccion.

### Endpoints privados protegidos

```bash
curl -i https://citypass-residuos-api.onrender.com/api/v1/contenedores
```

Resultado observado:

```http
HTTP/2 401
```

```json
{
  "statusCode": 401,
  "error": "UNAUTHORIZED",
  "message": "Falta el header Authorization: Bearer <token>"
}
```

Esto verifica que los guards estan activos en el despliegue.

## Pendientes operativos para la demo

- Cargar datos de demo antes de la presentacion para que el endpoint publico no responda `[]`.
- Despertar el backend unos minutos antes de mostrar la demo, porque el plan gratuito puede dormir
  por inactividad.
- Confirmar el mismo dia que el ultimo CI de `main` siga en verde.
