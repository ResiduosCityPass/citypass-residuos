# ADR-006 — Stack tecnológico del frontend

- **Estado:** Aceptado
- **Fecha:** 2026-08-20
- **Decisores:** Máximo Trufelman (responsable de frontend)

## Contexto

El módulo necesita una aplicación web que consuma la API REST del backend. El backend impone muy
poco: REST sobre HTTP con JSON, autenticación por header `Authorization: Bearer <jwt>` y errores
con un campo `code` estable ([ADR-001](ADR-001-stack-tecnologico.md)). Cualquier cliente que sepa
hacer `fetch` sirve.

Las restricciones que sí pesan salen de la rúbrica y del alcance:

1. **Mapa interactivo.** CU-07 (mapa en tiempo real) y CU-11 (contenedores cercanos) son el núcleo
   de la dimensión 9. La librería de mapas no puede exigir una API key con tarjeta de crédito
   asociada: es un trabajo académico y nadie va a poner su tarjeta.
2. **Cobertura de tests del 60%** (dimensión 6), que aplica al módulo completo, no solo al backend.
3. **Dockerizable** para el despliegue cloud (dimensión 7), que arma Ramiro.
4. **Un solo desarrollador** durante siete sprints, en paralelo a las otras materias. El costo de
   aprendizaje de la herramienta se paga con tiempo que no hay.

## Opciones consideradas

### A. Angular
- **A favor:** framework completo y opinado (routing, formularios, HTTP e inyección de dependencias
  vienen en la caja); testing configurado desde el `ng new`; la estructura impuesta evita discutir
  decisiones de organización con uno mismo.
- **En contra:** es el stack más pesado de los tres para un desarrollador solo; no tiene wrapper
  oficial de Leaflet, hay que envolver la librería a mano; el build produce más artefactos y el
  ciclo de desarrollo es más lento que Vite.

### B. React + Vite  ← elegida
- **A favor:** `react-leaflet` es el wrapper oficial de Leaflet y está mantenido; Vite arranca el
  dev server en menos de un segundo y el HMR hace que probar el mapa contra el simulador sea
  inmediato; el build es estático puro, así que el `Dockerfile` es un `nginx` de diez líneas;
  Vitest + Testing Library cubren el requisito de cobertura sin configuración extra.
- **En contra:** no impone estructura, hay que decidirla (se resuelve con la convención de carpetas
  descrita abajo); el routing y el manejo de estado son librerías aparte si el proyecto crece.

### C. Next.js
- **A favor:** trae routing y layouts resueltos; buen soporte de TypeScript; es lo más cercano a un
  estándar de industria hoy.
- **En contra:** el renderizado en servidor es contraproducente acá: Leaflet toca `window` y hay que
  cargarlo dinámicamente con SSR desactivado, o sea que se paga la complejidad de Next sin usar su
  ventaja principal. Además el contenedor Docker deja de ser estático y pasa a ser un servidor Node,
  que es más trabajo para Ramiro. Todos los datos son privados y detrás de un token: no hay SEO ni
  contenido público que justifique SSR.

### Librería de mapas

- **Google Maps / Mapbox:** mejores tiles y más features, pero **exigen API key con tarjeta**. Descartadas
  por el punto 1 del contexto.
- **Leaflet + OpenStreetMap  ← elegida:** sin key, sin cuenta, sin costo; `CircleMarker` permite
  pintar el estado con color sin depender de assets de íconos.

## Decisión

**React 19 + Vite, en JavaScript (sin TypeScript), con `react-leaflet` sobre tiles de OpenStreetMap.**
Tests con **Vitest + Testing Library**.

Se elige JavaScript y no TypeScript porque es donde el responsable rinde más hoy, y en un proyecto de
siete sprints con un solo desarrollador la velocidad de avance pesa más que la seguridad de tipos.
La contra —los payloads de la API tienen muchos campos en castellano y un typo se descubre recién en
runtime— se mitiga documentando las respuestas con **JSDoc** en `src/api/residuos.js`: son comentarios,
no cambian el build, pero el editor autocompleta igual.

Convención de carpetas dentro de `frontend/src`:

| Carpeta | Contiene |
|---|---|
| `api/` | Cliente HTTP (token + normalización de errores) y las funciones por endpoint |
| `dominio/` | Enums, colores y helpers del vocabulario del dominio |
| `hooks/` | Lógica reutilizable con estado, como el polling del mapa |
| `componentes/` | Componentes de presentación |

## Consecuencias

- **Toda llamada a la API pasa por `src/api/cliente.js`.** Es el único lugar que conoce el header
  `Authorization` y el único que traduce errores. Cuando el Squad 2 publique el login federado
  ([ADR-005](ADR-005-seguridad-identidad.md)), cambia de dónde sale el token y nada más.
- **Los errores se ramifican por `code`, nunca por `message`.** El cliente expone `ErrorApi` con
  `code`, `status` y `mensaje`; en `HTTP_400` el backend manda `message` como array de strings y el
  cliente lo unifica a texto.
- **El mapa se actualiza por polling cada 30 segundos**, porque no hay WebSocket y está evaluado
  recién para el Sprint 5. El intervalo es una constante única en `hooks/useMapaEnVivo.js`: si
  aparece el WebSocket, se reemplaza ahí.
- **El estado del contenedor y sus alertas se piden por separado y se cruzan en el cliente**, porque
  `GET /mapa/contenedores` no informa alertas y un contenedor puede estar `NORMAL` (verde) con una
  alerta de `INCENDIO` abierta. Si el backend agrega esa información al payload del mapa, la segunda
  llamada desaparece.
- **El artefacto de despliegue son archivos estáticos** (`npm run build` → `dist/`). Ramiro puede
  servirlos con cualquier imagen de nginx; no hace falta Node en producción.
- No se adopta librería de manejo de estado global ni router todavía. Con una sola pantalla no se
  justifican; se reevalúa en el Sprint 2, cuando entren las pantallas de ABM.
