# ADR-008 — Destino cloud para despliegue

- **Estado:** Aceptado
- **Fecha:** 2026-09-03
- **Decisores:** Ramiro Souto (DevOps), Squad 4

## Contexto

La dimensión 7 de la rúbrica pide despliegue cloud e infraestructura como código. El módulo ya
tiene:

- Backend NestJS dockerizado.
- Frontend React + Vite con build estático.
- PostgreSQL 16 con migraciones versionadas.
- RabbitMQ declarado localmente, aunque el backend todavía puede correr con `EVENT_BUS_DRIVER=inmemory`.
- CI en GitHub Actions.

La solución elegida tiene que ser simple de operar por un equipo universitario, versionable en el
repo y demostrable sin depender de pasos manuales difíciles de reproducir.

## Opciones consideradas

### A. Render

- **A favor:** Blueprints con `render.yaml` como IaC; soporta Docker en monorepos; ofrece sitios
  estáticos para el frontend; tiene PostgreSQL administrado; permite servicios privados y red
  privada entre servicios; existe una guía oficial para correr RabbitMQ con Docker y disco
  persistente.
- **En contra:** el plan gratuito no es producción: los web services pueden dormir por inactividad
  y PostgreSQL gratuito expira a los 30 días. Para una demo estable habría que usar planes pagos o
  recrear la base antes de la entrega.

### B. Railway

- **A favor:** muy buen flujo para proyectos chicos, servicios Docker y bases administradas; la CLI
  permite definir infraestructura.
- **En contra:** el modelo nuevo de IaC (`.railway/railway.ts`) está en beta y el config-as-code
  anterior queda deprecado. Para una entrega académica conviene evitar una superficie que puede
  cambiar justo durante el proyecto.

### C. Fly.io

- **A favor:** despliegue Docker natural con `fly.toml`, buena red privada y soporte para Postgres.
- **En contra:** requiere más operación manual para coordinar varios servicios, base de datos,
  secretos y dominios. Es potente, pero menos directo para demostrar IaC de todo el módulo.

### D. AWS con Terraform

- **A favor:** es la opción más completa y defendible en términos empresariales: ECS/App Runner,
  RDS, Amazon MQ o SQS/SNS y Terraform.
- **En contra:** sobrepasa el alcance del equipo y del sprint. Aumenta mucho el costo operativo:
  cuentas, IAM, VPC, networking, billing y limpieza de recursos.

## Decisión

**Usar Render como destino cloud del módulo.**

La infraestructura se va a describir en un `render.yaml` versionado en el repo. El primer despliegue
incluye:

- Frontend como static site.
- Backend como web service Docker usando `backend/Dockerfile`.
- PostgreSQL administrado.
- Variables de entorno conectadas desde el Blueprint.

RabbitMQ queda fuera del primer despliegue cloud mientras el backend corra con `EVENT_BUS_DRIVER=inmemory`.
Cuando el driver `rabbitmq` esté implementado, se agregará como servicio privado Docker con disco
persistente o se reemplazará por el bus real definido por el Squad 1.

## Consecuencias

- El próximo paso de DevOps es crear `render.yaml` y validar que representa el mismo entorno lógico
  que `infra/docker-compose.yml`.
- Las migraciones deben correr como paso de deploy, no a mano desde la consola.
- Los secretos reales no se versionan. El Blueprint puede declarar `sync: false` para que Render los
  pida en el dashboard.
- Para demo gratuita hay que recordar la limitación de PostgreSQL: si se usa plan free, la base dura
  30 días. Para una demo más estable conviene pasar la base a un plan pago mínimo.
- La decisión se puede migrar más adelante a AWS/Terraform si el alcance del proyecto crece, pero
  para este TPO Render maximiza entrega verificable con baja carga operativa.
