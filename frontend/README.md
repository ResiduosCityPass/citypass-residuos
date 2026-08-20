# Frontend — dueño: Máximo

React 19 + Vite + TypeScript + Leaflet. Ver [ADR-001](../docs/adr/ADR-001-stack-tecnologico.md).

Todavía sin inicializar. Para arrancar (Sprint 1):

```bash
npm create vite@latest . -- --template react-ts
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

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

- **Leaflet, no Google Maps.** No requiere API key ni tarjeta de crédito, y para marcadores con
  filtros alcanza de sobra.
- **Colores del mapa:** verde `NORMAL`, amarillo `ADVERTENCIA`, rojo `CRITICO`, gris
  `FUERA_DE_SERVICIO`. Los valores del enum están en `backend/src/shared/domain/enums.ts`.
- **Refresco:** polling cada 30s para el Hito 1. WebSocket es mejora del Sprint 5, si hay tiempo.
- **Errores:** el backend devuelve un campo `code` estable en cada error. Ramificá por `code`,
  nunca por el texto de `message` — el mensaje está en castellano y puede cambiar.
  Ver [api-preliminar.md](../docs/arquitectura/api-preliminar.md).
- No hace falta esperar al backend para arrancar: los contratos de todos los endpoints ya están
  escritos en `docs/arquitectura/api-preliminar.md`. Se puede mockear y empezar hoy.
