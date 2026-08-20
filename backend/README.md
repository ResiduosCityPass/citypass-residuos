# Backend — Módulo de Residuos

NestJS 11 + TypeScript + PostgreSQL. Ver [ADR-001](../docs/adr/ADR-001-stack-tecnologico.md).

## Puesta en marcha

```bash
docker compose -f ../infra/docker-compose.yml up -d
cp .env.example .env
npm install
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/v1/health`

## Arquitectura de carpetas

```
src/
├── config/           Configuración tipada y data-source de TypeORM
├── shared/
│   ├── auth/         Guards de JWT, roles y API key de sensores (ADR-005)
│   ├── events/       Abstracción EventPublisher + drivers (ADR-003)
│   ├── filters/      Filtro global de excepciones
│   └── domain/       Enums y tipos compartidos del dominio
└── modules/          Un módulo por agregado del dominio
    ├── contenedores/     CU-01
    ├── zonas/            CU-02
    ├── flota/            CU-03
    ├── lecturas/         CU-04  ← ingesta, el endpoint más caliente
    ├── alertas/          CU-05, CU-06
    ├── mapa/             CU-07
    ├── rutas/            CU-08, CU-09, CU-10
    ├── publico/          CU-11
    └── prediccion/       CU-12
```

Cada módulo sigue la misma división interna:

```
modules/<agregado>/
├── domain/          Entidad, reglas de negocio puras, interfaz de repositorio
├── application/     Casos de uso (services). Orquestan, no conocen HTTP ni SQL
├── infrastructure/  Repositorio TypeORM, adaptadores
└── <agregado>.controller.ts   Solo traduce HTTP ↔ caso de uso
```

Esta separación es lo que evalúa la dimensión 1 de la rúbrica. La regla práctica: **la carpeta
`domain/` no importa nada de NestJS ni de TypeORM.** Si un archivo de `domain/` necesita un
`import` de un framework, la responsabilidad está mal ubicada.

## Tests

```bash
npm test            # unitarios
npm run test:cov    # con reporte de cobertura
```

El umbral de cobertura está fijado en **60%** en `package.json` (`coverageThreshold`). Si la
cobertura baja de ahí, `npm run test:cov` falla y el CI corta el merge. Es intencional: la
dimensión 6 de la rúbrica pide exactamente ese número, y es mucho más barato sostenerlo desde
el Sprint 1 que recuperarlo en septiembre.
