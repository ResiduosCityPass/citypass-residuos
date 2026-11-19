# Análisis de vulnerabilidades en dependencias del backend

Revisión del 18/11/2026 con `npm audit --omit=dev` en `backend/`, sobre las dependencias de
producción. En el frontend, el mismo comando no reporta vulnerabilidades.

## Decisión

**Se registran y no se actualizan antes de las presentaciones del Hito 2.** Las 12 alertas
siguen abiertas: este documento las analiza, no las corrige.

| | |
|---|---|
| **Responsable** | Francisco Isola (backend) |
| **Fecha** | 27/11/2026, después de la última presentación del Hito 2 |
| **Riesgo pendiente hasta entonces** | Denegación de servicio por `body-parser` y `qs`, alcanzables en los endpoints que reciben body o query. No exponen ni modifican datos, pero pueden degradar la API |

`npm audit fix` resuelve 10 de las 12 sin cambios de versión mayor. Pero entre las librerías que
cambia están las que leen el body y el query de cada request:

| Paquete | De | A |
|---|---|---|
| `@nestjs/platform-express` | 11.2.1 | 11.2.11 |
| `body-parser` | 2.3.0 | 2.4.0 |
| `qs` | 6.15.3 | 6.17.1 |
| `multer` | 2.2.0 | 2.5.0 |
| `swagger-ui-dist` | 5.32.13 | 5.34.1 |

El cambio podría alterar, aunque sea mínimamente, el comportamiento de cualquier caso de uso. Con
el repositorio congelado y las demos de los casos integradores en curso, el riesgo de una regresión
pesa más que el de estas vulnerabilidades. Las que podrían comprometer datos (`proxy-addr` y
`fast-uri`) no son alcanzables con la configuración actual. **Dos sí lo son** (`body-parser` y
`qs`): afectan la disponibilidad, no los datos (ver la tabla).

Las 2 restantes (`glob` y `minimatch`, ambas moderadas) solo se resuelven con TypeORM 1.x, una
versión mayor con cambios incompatibles.

## Detalle y exposición

| Paquete | Severidad | Qué es | ¿Nos expone? |
|---|---|---|---|
| `proxy-addr` | Crítica | Falsificación de IP con subredes *trust proxy* IPv4 mapeadas a IPv6 ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)) | **No, con la configuración actual.** La API no configura `trust proxy` ni usa la IP del cliente para autorizar |
| `multer` (vía `@nestjs/platform-express`) | Alta | Denegación de servicio con formularios multipart ([GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), [GHSA-qfvm-cv95-jqjf](https://github.com/advisories/GHSA-qfvm-cv95-jqjf)) | **No, con la configuración actual.** Ningún endpoint recibe archivos ni multipart |
| `fast-uri` | Alta | Confusión de host y SSRF al normalizar URIs ([GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8)) | **No, con la configuración actual.** Llega por `ajv`, dentro del cliente del Schema Registry de Kafka: valida los esquemas que publica el gateway del Squad 1. Ninguna URL que mande un usuario pasa por esta librería |
| `brace-expansion`, `glob`, `minimatch` (vía TypeORM) | Alta / moderada | Denegación de servicio con patrones de archivos | **No, con la configuración actual.** Solo se usan al arrancar, con rutas fijas del propio código |
| `js-yaml` (vía `@nestjs/swagger`) | Moderada | Consumo de CPU con YAML armado a propósito | **No, con la configuración actual.** Solo genera la documentación de la API; no lee YAML de usuarios |
| `body-parser` | Alta | Denegación de servicio con un body comprimido con bytes extra ([GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)) | **Sí, parcial.** Es alcanzable en los endpoints que reciben body, pero solo degrada el servicio: no expone ni modifica datos |
| `qs` | Moderada | Denegación de servicio y saltos del límite de arrays al parsear el query ([GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)) | **Sí, parcial.** Igual que la anterior: solo disponibilidad |

## Plan

El 27/11, a cargo de backend:

1. Ejecutar `npm audit fix` en `backend/` en una rama propia.
2. Correr los tests unitarios e integrales y probar los casos de uso en Render.
3. Evaluar la migración a TypeORM 1.x por separado.
