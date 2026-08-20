# ADR-001 — Stack tecnológico del módulo

- **Estado:** Aceptado
- **Fecha:** 2026-08-20
- **Decisores:** Squad 4

## Contexto

El Sprint 0 exige definir y asignar el stack antes del 27/08. El módulo debe exponer una API REST,
publicar y consumir eventos asincrónicos, proteger endpoints con JWT, alcanzar 60% de cobertura de
tests y desplegarse en la nube. El equipo tiene experiencia previa en JavaScript y Node.js;
nadie tiene entorno Java instalado.

## Opciones consideradas

### A. Java + Spring Boot
- **A favor:** estándar de facto en integración empresarial; Spring Security, Spring Cloud Stream y
  JUnit + JaCoCo cubren varias dimensiones de la rúbrica de forma nativa; alineado con el perfil
  técnico del docente.
- **En contra:** ningún integrante tiene experiencia ni JDK instalado; la curva de aprendizaje
  consumiría buena parte del Sprint 1, que es corto (28/08 – 10/09).

### B. Node.js + Express
- **A favor:** máxima familiaridad del equipo; mínimo overhead conceptual.
- **En contra:** no impone estructura. La dimensión 1 de la rúbrica evalúa explícitamente
  *"modularidad interna, separación de responsabilidades, uso de patrones adecuados"*, y con Express
  esa arquitectura hay que construirla y sostenerla a mano.

### C. Node.js + NestJS + TypeScript  ← elegida
- **A favor:** mismo runtime que Express, pero con módulos, inyección de dependencias y capas
  impuestas por el framework (dim. 1); guards e interceptores para JWT y roles (dim. 3);
  `@nestjs/swagger` y filtros de excepción (dim. 4); `@nestjs/microservices` con transporte RabbitMQ
  o Kafka intercambiable por configuración (dim. 5); Jest con reporte de cobertura integrado (dim. 6).
- **En contra:** TypeScript y los decoradores agregan curva sobre JavaScript plano; el framework es
  opinado y hay que aprender su vocabulario.

### D. Python + FastAPI
- **A favor:** el más rápido para prototipar; ecosistema natural para el componente de ML (CU-12).
- **En contra:** menos convencional para una materia centrada en integración empresarial; el equipo
  tiene menos experiencia.

## Decisión

**Backend: NestJS 11 + TypeScript sobre Node.js 22.**
**Frontend: React 19 + Vite + Leaflet** (Leaflet sobre Google Maps porque no requiere API key ni
tarjeta de crédito, y CU-07/CU-11 solo necesitan marcadores y filtros).

El costo de aprender TypeScript se paga una vez; el costo de sostener una arquitectura por
convención en Express se paga en cada sprint y es lo que la rúbrica evalúa.

## Consecuencias

- El componente de ML de CU-12 se implementa en TypeScript (regresión lineal por mínimos cuadrados,
  ~40 líneas) en lugar de recurrir a scikit-learn. Es suficiente para el alcance definido y evita
  introducir un segundo runtime en el despliegue.
- Se adopta `strict: true` en TypeScript desde el inicio: es más barato que activarlo después.
- La estructura de carpetas del backend refleja capas explícitas (`domain`, `application`,
  `infrastructure`) para que la separación de responsabilidades sea verificable, no declarativa.
