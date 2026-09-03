# ADR-002 — Motor de persistencia y acceso a datos

- **Estado:** Aceptado
- **Fecha:** 2026-08-20
- **Decisores:** Squad 4

## Contexto

El dominio tiene entidades fuertemente relacionadas (contenedor → zona, contenedor → sensor,
ruta → paradas → contenedor) y una tabla de lecturas de sensores que crece de forma continua:
con 500 contenedores reportando cada 15 minutos son ~48.000 filas por día. Se necesitan además
consultas geoespaciales simples para CU-11.

## Opciones consideradas

### A. MongoDB
- **A favor:** esquema flexible, escritura rápida de series de lecturas, `$geoNear` nativo.
- **En contra:** el dominio es marcadamente relacional; el diagrama entidad-relación es un
  entregable obligatorio del Hito 1 y modelarlo sobre documentos lo vuelve artificial.

### B. PostgreSQL + TypeORM  ← elegida
- **A favor:** integridad referencial real; el DER sale directo de las entidades; TypeORM es el ORM
  de primera clase en NestJS; migraciones versionadas; PostGIS disponible si algún día se necesita
  el CU-02 completo con polígonos.
- **En contra:** el esquema rígido obliga a migraciones ante cada cambio; TypeORM tiene fricciones
  conocidas en relaciones complejas.

### C. PostgreSQL + Prisma
- **A favor:** mejor experiencia de tipado y migraciones más limpias que TypeORM.
- **En contra:** se integra peor con el sistema de inyección de dependencias de NestJS; hay menos
  material de referencia para el patrón repositorio en este contexto.

## Decisión

**PostgreSQL 16 con TypeORM**, corriendo en Docker vía `infra/docker-compose.yml`.

Las consultas geoespaciales de CU-11 se resuelven con la **fórmula de Haversine en SQL plano**, sin
instalar PostGIS. Para el volumen del proyecto es más que suficiente y evita una dependencia pesada.

## Consecuencias

- `synchronize` queda **apagado por defecto**. El esquema lo definen migraciones versionadas en
  `backend/src/migrations/`, porque el despliegue cloud (dim. 7) no puede depender de
  autosincronización, y porque con synchronize dos máquinas terminan con esquemas distintos según
  la última rama que corrió cada una. *(Implementado en el Sprint 2: `EsquemaInicial`.)*
- Se define índice compuesto sobre `lectura (contenedor_id, timestamp DESC)`: es el acceso que usan
  tanto el motor de reglas de CU-05 como la predicción de CU-12.
- El acceso a datos se encapsula tras interfaces de repositorio definidas en la capa de dominio, de
  modo que los tests unitarios no necesiten base de datos.
