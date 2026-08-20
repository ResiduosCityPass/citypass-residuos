# Frontend — dueño: Máximo

## El stack lo definís vos

**No está decidido, y es tu decisión.** Sos quien lo va a construir y mantener durante los siete
sprints, así que elegí con lo que rindas más.

Cuando lo definas, escribí el **ADR-006** en `docs/adr/` siguiendo el mismo formato que los demás:
**Contexto → Opciones consideradas → Decisión → Consecuencias**. No es burocracia nuestra, es
requisito explícito de la cátedra: *"todas las decisiones de arquitectura deben documentarse
mediante un ADR que muestre las opciones consideradas"*. Mostrar dos o tres alternativas con sus
contras vale puntos; poner solo la elegida, no.

## Lo que el backend te impone (que es casi nada)

- **REST sobre HTTP, JSON.** Nada de GraphQL ni gRPC del lado del módulo.
- **CORS ya está habilitado** para cualquier origen en desarrollo, así que podés levantar tu dev
  server en el puerto que quieras.
- **Autenticación por header** `Authorization: Bearer <jwt>`. El token lo emite el Squad 2.
- **Errores con un campo `code` estable.** Ramificá por `code`, nunca por el texto de `message`:
  el mensaje está en castellano y puede cambiar sin aviso.

Eso es todo. Cualquier tecnología de cliente que sepa hacer `fetch` sirve.

## Restricciones reales que sí conviene tener en cuenta al elegir

1. **Necesitás un mapa.** CU-07 (mapa en tiempo real) y CU-11 (contenedores cercanos) son el
   corazón de la dimensión 9 de la rúbrica. Fijate que la librería de mapas que elijas se integre
   bien con el framework, y ojo con las que exigen API key con tarjeta de crédito asociada.
2. **Hay que testear.** La dimensión 6 pide 60% de cobertura y aplica a todo el módulo, no solo al
   backend. Elegí algo con un camino de testing que ya conozcas.
3. **Hay que dockerizarlo.** Ramiro necesita poder empaquetarlo para el despliegue cloud
   (dimensión 7). Cualquier cosa que produzca estáticos o corra en Node le sirve; avisale qué
   elegiste así arma el `Dockerfile`.

## No necesitás esperar al backend

**Todos los contratos de endpoints ya están escritos** en
[docs/arquitectura/api-preliminar.md](../docs/arquitectura/api-preliminar.md), con sus payloads,
roles y códigos de error. Podés mockearlos y arrancar hoy mismo.

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
