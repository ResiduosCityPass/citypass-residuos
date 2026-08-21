# Frontend — dueño: Máximo

SPA del módulo de Residuos. Seis secciones: el mapa en tiempo real (CU-07), el ABM de
contenedores (CU-01) con la predicción de saturación (CU-12), el de zonas y umbrales (CU-02), el
tablero de alertas (CU-05/CU-06), la flota (CU-03) y las rutas (CU-08/CU-09).

**Qué cubre cada pantalla, dónde vive y qué falta: [CASOS-DE-USO.md](CASOS-DE-USO.md).**

## Stack

**React 19 + Vite, en JavaScript**, con **Leaflet** (`react-leaflet`) sobre tiles de OpenStreetMap
y **Vitest + Testing Library** para los tests. Las alternativas evaluadas y el porqué de cada
descarte están en [ADR-006](../docs/adr/ADR-006-stack-frontend.md).

## Cómo levantarlo

### Sin backend, con datos de demostración

Para diseñar o mostrar las pantallas no hace falta ni la API ni Docker ni un token. Con
`VITE_USE_MOCKS=true` en `.env.local` (así viene en `.env.example`):

```bash
cd frontend && npm install && npm run dev
```

Los datos salen de un servidor falso en memoria (`src/mocks/`) que responde con las mismas formas
que la API y **falla con los mismos códigos de error**. Las mutaciones se ven: dar de alta un
contenedor lo agrega a la tabla, resolver una alerta la mueve de estado. Se reinicia al recargar
la página. La pantalla avisa con un cartel *Datos de demostración* para que nadie confunda una
captura con datos reales. Ver [ADR-007](../docs/adr/ADR-007-design-system-y-mocks.md).

### Contra la API real

Poné `VITE_USE_MOCKS=false` y levantá el backend:

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
| `src/api/` | `client.js` (token + errores), `waste.http.js` (una función por endpoint) y `waste.js` (elige entre la API real y los mocks) |
| `src/domain/` | Enums, colores de estado, reglas de las alertas y traducción de errores |
| `src/hooks/` | `useLiveMap.js`: el polling del mapa |
| `src/components/ui/` | Primitivas del design system: `Button`, `Field`, `Modal`, `Table`, `Chip`, `Notice`, `FillBar` |
| `src/components/shell/` | Sidebar, barra superior e iconografía |
| `src/components/{containers,zones,alerts,fleet,routes}/` | Componentes de cada caso de uso |
| `src/components/` | Los que comparte más de una pantalla |
| `src/pages/` | Una por ruta |
| `src/styles/` | `tokens.css` (paleta y escalas) y `ui.css` |
| `src/mocks/` | Datos falsos. **Andamiaje temporal:** se borra al conectar las pantallas |
| `src/test/` | Setup de Vitest. Los tests viven al lado del archivo que prueban |

**Ninguna pantalla importa datos de otro lado que `src/api/waste.js`**, y toda llamada real
pasa por `src/api/client.js`. Es el único lugar que conoce el header de
autenticación y el único que traduce errores. Los errores se ramifican por `code`, nunca por el
texto de `message`.

### Idioma del código

Los identificadores —archivos, componentes, funciones, variables, clases CSS— están **en inglés**.
Los comentarios, las descripciones de los tests y los textos que ve el usuario están **en
castellano**.

Lo que llega de la API se queda como está: nombres de campos (`nivelLlenadoPct`, `zonaId`),
valores de enum (`CRITICO`, `EN_ATENCION`), códigos de error (`ZONA_CON_CONTENEDORES`) y las
rutas (`/mapa/contenedores`). No son código nuestro, son el contrato del backend. Por eso vas a
ver cosas como `fetchContainers()` devolviendo objetos con `nivelLlenadoPct` adentro: el
vocabulario del dominio viene del contrato.

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

**9 de los 12 casos de uso están diseñados**, ninguno conectado todavía: todos corren contra los
mocks. Faltan CU-11 (vista ciudadana) y CU-10 (pantalla del chofer); CU-04 no tiene pantalla
porque lo llaman los sensores.

El detalle —qué pantalla cubre cada caso de uso, en qué archivos vive, qué endpoint consume, qué
reglas de dominio resuelve y qué límites del backend quedaron a la vista— está en
**[CASOS-DE-USO.md](CASOS-DE-USO.md)**.

## Notas de implementación

- **Colores del mapa:** Verde Urbano `NORMAL`, Ámbar `ADVERTENCIA`, Rojo Emergencia `CRITICO`,
  Gris Medio `FUERA_DE_SERVICIO`, según la paleta de CityPass+. Los valores exactos del enum están
  en `backend/src/shared/domain/enums.ts`.
- **Tres límites del backend están visibles en la UI a propósito:** no hay endpoint para listar
  usuarios con rol `CHOFER`, así que el `<select>` de CU-09 se llena con datos falsos y la
  pantalla lo dice; el botón "Poner fuera de
  servicio" del detalle está deshabilitado porque `PATCH /contenedores/:id` no acepta `estado`, y
  el listado no puede saber si un contenedor ya tiene sensor, así que deja intentar y muestra el
  `409 CONTENEDOR_YA_TIENE_SENSOR`. Los tres son pedidos de contrato pendientes.
- **Refresco:** polling cada 30s alcanza para el Hito 1. WebSocket es mejora del Sprint 5, si hay
  tiempo.
- Si algo del contrato de la API no te cierra o te falta un campo, decilo antes de que lo
  implemente: cambiarlo ahora es gratis, en septiembre no.
