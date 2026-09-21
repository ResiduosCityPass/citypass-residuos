# Evidencia de despliegue cloud

Evidencia del despliegue del modulo de Residuos en Render, usando la infraestructura declarada en
[`render.yaml`](../../render.yaml).

## Resumen

| Item | Valor |
|---|---|
| Proveedor cloud | Render |
| Blueprint | `citypass-residuos` |
| Branch desplegada | `main` |
| Commit verificado | `680312b` - `Merge pull request #29 from ResiduosCityPass/develop` |
| Fecha de verificacion | 2026-09-19 ART |
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
| CI/CD | <https://github.com/ResiduosCityPass/citypass-residuos/actions/runs/34300063105> | Backend, frontend, Docker, SonarQube y deploy-info en verde |
| Calidad de codigo | <https://sonarcloud.io/summary/overall?id=ResiduosCityPass_citypass-residuos2&branch=main> | Analisis de calidad, seguridad, fiabilidad y cobertura de SonarQube Cloud |
| IaC | [`render.yaml`](../../render.yaml) | La infraestructura esta declarada como codigo |

### Capturas sugeridas

- GitHub Actions con la ultima corrida verde de `main`.
- Job `Docker — build de imagenes` mostrando backend y frontend OK.
- Job `SonarQube Cloud — calidad y cobertura` mostrando el analisis OK.
- Job `Deploy — Render` mostrando que los hooks de API y frontend fueron aceptados.
- Dashboard de SonarQube Cloud para `main` con el Quality Gate aprobado.
- Blueprint `citypass-residuos` en Render con API, frontend y DB creados.
- API health en navegador con `status: ok`.
- Frontend abierto en `https://citypass-residuos-frontend.onrender.com`.
- Pantalla de la DB mostrando vencimiento `2026-10-04`.

### Mini guion DevOps

> "El despliegue esta definido como infraestructura como codigo en `render.yaml`. GitHub Actions
> valida backend, frontend, las imagenes Docker y SonarQube. Cuando `main` queda en verde, el job
> `Deploy — Render` llama a los hooks privados de ambos servicios. La API, el frontend y PostgreSQL
> estan creados desde el Blueprint, sin secretos dentro del codigo."

## CI en `main`

La rama `main` quedo sincronizada desde `develop` y se verifico el despliegue del commit
`680312b`.

Workflow verificado:

- CI: revisar la ultima corrida verde de `main` en <https://github.com/ResiduosCityPass/citypass-residuos/actions>.
- Backend: lint, build, migraciones, cobertura y tests de integracion en verde.
- Frontend: lint, build y tests con cobertura en verde.
- Docker: build de imagen backend y frontend en verde.
- SonarQube Cloud: analisis de calidad y cobertura en verde. Dashboard: <https://sonarcloud.io/summary/overall?id=ResiduosCityPass_citypass-residuos2&branch=main>.
- El 2026-09-19 Render no reacciono al push aunque los checks pasaron; API y frontend se
  desplegaron manualmente y quedaron en `680312b`.

## CD hacia Render

El deploy productivo se gestiona con el Blueprint de Render declarado en `render.yaml`.

El workflow `CI` incluye el job final `Deploy — Render`, que corre solo en pushes a `main` despues
de que backend, frontend, Docker y SonarQube terminan correctamente. El job hace un `POST` a los
deploy hooks guardados como secretos de GitHub para API y frontend. Los servicios usan
`autoDeployTrigger: off`: asi hay un solo disparador, visible y auditable desde CI.

El cambio reemplaza el mecanismo anterior `checksPass`, que estaba configurado correctamente pero
no proceso el push de `680312b`. El primer merge posterior a esta correccion debe confirmar ambos
deploys en Render y registrar la corrida de CI correspondiente.

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

El 2026-09-08 se cargo el escenario de demo con una zona, ocho contenedores y ocho sensores
alrededor del Obelisco. El endpoint devuelve los ocho contenedores, lo que verifica API,
PostgreSQL, esquema y datos de negocio publicados.

El mapa operativo contiene los ocho contenedores de demo en estado `NORMAL`, con niveles iniciales
entre 10% y 40%. Las alertas abiertas quedaron resueltas para que la demo arranque limpia.

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

- Despertar el backend unos minutos antes de mostrar la demo, porque el plan gratuito puede dormir
  por inactividad.
- Confirmar el mismo dia que el ultimo CI de `main` siga en verde.
