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

## Probar la API mientras no exista el login federado

Todos los endpoints están protegidos (ADR-005). Hasta que el Squad 2 publique su emisor,
los tokens se firman localmente:

```bash
npm run token:dev -- ADMINISTRADOR
```

Roles disponibles: `ADMINISTRADOR`, `OPERADOR`, `CHOFER`, `CIUDADANO`. Pegá el token en el
botón **Authorize** de Swagger, o mandalo como `Authorization: Bearer <token>`.

Esto **no** es un sustituto del login federado: desaparece en el Sprint 3.

## Cargar datos de demo

El simulador de sensores vive en [`../simulator`](../simulator/README.md). Crea zona,
contenedores y sensores, y después les hace reportar lecturas.

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
    ├── mapa/             CU-07  (implementado)
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

Esta separación es lo que evalúa la dimensión 1 de la rúbrica. Dos reglas prácticas:

1. **`domain/` no conoce HTTP.** Nada de `@Get`, `Request`, `Response` ni códigos de estado ahí
   adentro. Las entidades sí llevan decoradores de TypeORM (es lo idiomático en NestJS), pero las
   **reglas de negocio puras viven en archivos sin ningún decorador**, en `domain/reglas/`, y se
   testean sin base de datos ni contenedor de inyección.
2. **`application/` no conoce SQL.** Los servicios dependen de una interfaz de repositorio
   declarada en `domain/`, nunca del `Repository` de TypeORM. La implementación concreta vive en
   `infrastructure/`. Es lo que permite que los tests unitarios pasen un doble en lugar de
   levantar Postgres (ver ADR-002).

## Tests

```bash
npm test            # unitarios
npm run test:cov    # con reporte de cobertura
```

El umbral de cobertura está fijado en **60%** en `package.json` (`coverageThreshold`). Si la
cobertura baja de ahí, `npm run test:cov` falla y el CI corta el merge. Es intencional: la
dimensión 6 de la rúbrica pide exactamente ese número, y es mucho más barato sostenerlo desde
el Sprint 1 que recuperarlo en septiembre.

### Qué queda fuera del cómputo de cobertura, y por qué

`collectCoverageFrom` excluye módulos, DTOs, entidades, `main.ts`, scripts y
**`*.typeorm.repository.ts`**. Los primeros son declarativos y no tienen lógica que romper.

La exclusión que sí hay que justificar es la de los adaptadores de TypeORM: son delegación
directa al ORM, sin una sola rama condicional. Un test unitario ahí verifica que un mock
devuelve lo que le pedimos que devuelva —o sea, verifica el mock— no que el SQL sea correcto.
Lo que los cubre de verdad son **tests de integración contra Postgres, planificados para el
Sprint 2**, que es exactamente lo que la cátedra pide bajo "unitarios e integrales".

Mantenerlos dentro del cómputo con tests de mentira daría un número más alto y menos verdadero.
