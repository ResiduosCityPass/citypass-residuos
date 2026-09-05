# Evidencia de despliegue cloud

Evidencia del despliegue del modulo de Residuos en Render, usando la infraestructura declarada en
[`render.yaml`](../../render.yaml).

## Resumen

| Item | Valor |
|---|---|
| Proveedor cloud | Render |
| Blueprint | `citypass-residuos` |
| Branch desplegada | `main` |
| Commit desplegado | `fbba3aa` - `Merge develop into main` |
| Fecha de verificacion | 2026-09-04 21:02 ART |
| Responsable | Ramiro Souto |

El `JWT_SECRET` esta configurado como secreto en Render y no se documenta en el repositorio.

## Recursos creados

| Recurso | Tipo | URL / nombre |
|---|---|---|
| Frontend | Static site | `https://citypass-residuos-frontend.onrender.com` |
| Backend API | Web service Docker | `https://citypass-residuos-api.onrender.com` |
| PostgreSQL | Managed database | `citypass-residuos-db` |

## CI en `main`

La rama `main` quedo sincronizada desde `develop` en el commit `fbba3aa`.

Workflow verificado:

- CI run: <https://github.com/ResiduosCityPass/citypass-residuos/actions/runs/33926308299>
- Backend: lint, build, migraciones, cobertura y tests de integracion en verde.
- Frontend: lint, build y tests con cobertura en verde.
- Docker: build de imagen backend y frontend en verde.

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

- Anotar la fecha de vencimiento de la base gratuita de Render.
- Cargar datos de demo antes de la presentacion para que el endpoint publico no responda `[]`.
- Despertar el backend unos minutos antes de mostrar la demo, porque el plan gratuito puede dormir
  por inactividad.
