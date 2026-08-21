# Frontend — dueño: Máximo

SPA del módulo de Residuos. Pantalla principal: el mapa de contenedores en tiempo real (CU-07).

## Stack

**React 19 + Vite, en JavaScript**, con **Leaflet** (`react-leaflet`) sobre tiles de OpenStreetMap
y **Vitest + Testing Library** para los tests. Las alternativas evaluadas y el porqué de cada
descarte están en [ADR-006](../docs/adr/ADR-006-stack-frontend.md).

## Cómo levantarlo

El frontend no sirve de nada sin la API. Primero el backend:

```bash
docker compose -f infra/docker-compose.yml up -d postgres
cd backend && npm install && npm run start:dev
```

Después el frontend, en otra terminal:

```bash
cd frontend && npm install && npm run dev
```

Queda en `http://localhost:5173`. La URL de la API se configura en `.env.local`
(copiá `.env.example`); por defecto apunta a `http://localhost:3000/api/v1`.

### Token

Todos los endpoints están protegidos. Generá uno y pegalo en la barra de arriba de la pantalla:

```bash
cd backend && npm run token:dev -- ADMINISTRADOR
```

Dura 8 horas y queda guardado en `localStorage`. Cuando el Squad 2 publique el login federado,
cambia de dónde sale el token; el header `Authorization: Bearer <jwt>` no cambia.

### Datos para ver algo en el mapa

```bash
cd simulator && TOKEN=<tu-token> npm run seed   # 8 contenedores alrededor del Obelisco
npm run saturacion                              # uno cruza el umbral y pasa a rojo en ~5s
npm run incendio                                # dispara una alerta crítica de incendio
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Dev server con HMR en el 5173 |
| `npm run build` | Build estático a `dist/` (es lo que se dockeriza) |
| `npm test` | Corre los tests una vez |
| `npm run test:watch` | Tests en modo watch |
| `npm run cobertura` | Tests + reporte de cobertura (umbral 60%, dimensión 6) |
| `npm run lint` | Oxlint |

## Estructura

| Carpeta | Contiene |
|---|---|
| `src/api/` | `cliente.js` (token + errores) y `residuos.js` (una función por endpoint) |
| `src/dominio/` | Enums, colores de estado y helpers del vocabulario del dominio |
| `src/hooks/` | `useMapaEnVivo.js`: el polling del mapa |
| `src/componentes/` | Componentes de presentación |

**Toda llamada a la API pasa por `src/api/cliente.js`.** Es el único lugar que conoce el header de
autenticación y el único que traduce errores. Los errores se ramifican por `code`, nunca por el
texto de `message`.

## Guía de la API

El contrato completo —request y response de cada endpoint, con ejemplos reales— está en
[docs/arquitectura/guia-frontend.md](../docs/arquitectura/guia-frontend.md). La sección 8 tiene las
reglas de dominio que no son obvias; vale la pena leerla antes de tocar el mapa.

## Lo que el backend te impone (que es casi nada)

- **REST sobre HTTP, JSON.** Nada de GraphQL ni gRPC del lado del módulo.
- **CORS ya está habilitado** para cualquier origen en desarrollo, así que podés levantar tu dev
  server en el puerto que quieras.
- **Autenticación por header** `Authorization: Bearer <jwt>`. El token lo emite el Squad 2.
- **Errores con un campo `code` estable.** Ramificá por `code`, nunca por el texto de `message`:
  el mensaje está en castellano y puede cambiar sin aviso.

Eso es todo. Cualquier tecnología de cliente que sepa hacer `fetch` sirve.

## Alcance

| Pantalla | CU | Sprint | Consume |
|---|---|---|---|
| Mapa en tiempo real | CU-07 | 1-2 | `GET /mapa/contenedores` |
| Alta y edición de contenedores | CU-01 | 2 | `/contenedores` |
| Zonas y umbrales | CU-02 | 2 | `/zonas` |
| Tablero de alertas | CU-05, CU-06 | 2 | `GET /alertas` |
| Consulta ciudadana | CU-11 | 4 | `GET /publico/contenedores/cercanos` |
| Propuesta y asignación de ruta | CU-08, CU-09 | 4 | `/rutas` |

## Notas de implementación

- **Colores del mapa:** verde `NORMAL`, amarillo `ADVERTENCIA`, rojo `CRITICO`, gris
  `FUERA_DE_SERVICIO`. Los valores exactos del enum están en
  `backend/src/shared/domain/enums.ts`.
- **Refresco:** polling cada 30s alcanza para el Hito 1. WebSocket es mejora del Sprint 5, si hay
  tiempo.
- Si algo del contrato de la API no te cierra o te falta un campo, decilo antes de que lo
  implemente: cambiarlo ahora es gratis, en septiembre no.
