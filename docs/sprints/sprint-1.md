# Sprint 1 — Desarrollo Modular I · 28/08 – 10/09

## Objetivo

Módulo funcional en autonomía: sensores reportando, reglas evaluándose y eventos publicándose,
sin depender del bus del Squad 1 ni del login del Squad 2.

**Criterio de éxito:** el simulador corre, las lecturas entran, un contenedor pasa a crítico
**una sola vez**, y el evento queda registrado en el driver `inmemory`.

## Estado

| CU | Alcance | Estado |
|---|---|---|
| — | 5 entidades TypeORM + índices | Hecho |
| CU-01 | CRUD de contenedores + vinculación de sensor con API key | Hecho |
| CU-02 | CRUD de zonas y umbrales | Hecho |
| CU-04 | Ingesta de lecturas + guard de `X-Sensor-Key` | Hecho |
| CU-05 | Detección de contenedor crítico + evento | Hecho |
| CU-06 | Detección de riesgo de incendio + evento | Hecho |
| CU-07 | `GET /mapa/contenedores` (backend) | Hecho |
| — | Simulador de sensores con 4 escenarios | Hecho |
| — | Guard JWT + roles con firma local | Hecho |
| CU-07 | Pantalla del mapa | Máximo |
| — | Dockerfile del backend | Ramiro |

## Verificación end-to-end

Ejecutado contra PostgreSQL real, no mocks:

```
[07:49:49] escenario: saturacion
  CT-0001   76.0%   20.9C  bat 100% NORMAL -> CRITICO  ALERTAS: SATURACION
[07:49:54]
  CT-0001   81.7%   20.1C  bat 100%
[07:49:58]
  CT-0001   87.5%   20.3C  bat 100%
```

A 81,7% y 87,5% el contenedor sigue por encima del umbral y **no** vuelve a alertar. Esa es la
regla central de CU-05 funcionando: el evento se emite en la transición, no en cada lectura.

Alertas persistidas al terminar:

```
SATURACION   MEDIA    ABIERTA  Nivel 76% supera el umbral 70% de la zona Centro
INCENDIO     CRITICA  ABIERTA  Temperatura interna 89.76C supera el umbral 60C de la zona Centro
```

## Métricas

| Métrica | Valor |
|---|---|
| Tests | 127, todos en verde |
| Cobertura global | 97,2% (umbral exigido: 60%) |
| Lint | Sin errores ni warnings |

## Decisiones tomadas durante el sprint

1. **La identidad del sensor sale de la API key, no del cuerpo del request.** El contrato
   original de `POST /lecturas` incluía `sensorId` en el payload; se quitó. Si viniera en el
   cuerpo, un sensor podría reportar en nombre de otro cambiando un campo.
2. **Lecturas fuera de orden se rechazan con 409.** Una lectura con timestamp anterior a la
   última registrada corrompería el estado desnormalizado del contenedor.
3. **La última lectura se desnormaliza sobre `CONTENEDOR`** (`estado`, `nivelLlenadoPct`,
   `temperaturaC`). El mapa de CU-07 no puede hacer JOIN contra una tabla que crece ~48.000
   filas por día.
4. **Los adaptadores de TypeORM quedan fuera del cómputo de cobertura unitaria.** Son
   delegación al ORM sin ramas; se cubren con tests de integración en el Sprint 2.

## Deuda técnica declarada

| Ítem | Cuándo |
|---|---|
| Envolver la ingesta en una transacción y publicar vía tabla `outbox` con reintentos | Sprint 2 |
| Tests de integración contra Postgres (levantar servicio en el CI) | Sprint 2 |
| Migraciones explícitas en lugar de `synchronize: true` | Sprint 2 |
| Driver `rabbitmq` del `EventPublisher` | Sprint 2 |

## Próximo sprint

Sprint 2 (11/09 – 23/09): CU-12 (predicción de saturación), testing de integración, y cierre
para el Hito 1 del 24/09.
