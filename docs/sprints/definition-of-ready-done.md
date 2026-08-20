# Definition of Ready / Definition of Done — Squad 4

Acordado en el Sprint 0. Basado en la Unidad 01 de la materia (Metodologías Ágiles, Kanban).
Toda tarjeta del board atraviesa estos dos filtros.

## Definition of Ready — para pasar a *Doing*

Una tarjeta no entra en desarrollo si no cumple **todos** estos criterios:

- [ ] Está priorizada en el backlog y vinculada a un CU del [backlog priorizado](backlog-priorizado.md).
- [ ] Tiene descripción clara: qué hace, para qué rol, y qué evento publica (si aplica).
- [ ] Tiene criterios de aceptación escritos y verificables.
- [ ] Tiene un responsable asignado.
- [ ] No depende de un ítem bloqueante sin resolver.
- [ ] Si toca la API, el contrato está reflejado en [api-preliminar.md](../arquitectura/api-preliminar.md).
- [ ] Si toca el modelo de datos, la entidad está en [modelo-de-datos.md](../arquitectura/modelo-de-datos.md).
- [ ] Si es de frontend, Máximo tiene el endpoint disponible o mockeado.

## Definition of Done — para pasar a *Done*

- [ ] Se cumplen todos los criterios de aceptación.
- [ ] Tiene tests unitarios y **la cobertura global no bajó del 60%** (el CI lo verifica y falla si baja).
- [ ] El código pasó revisión de al menos un par vía Pull Request. Nadie mergea su propio PR.
- [ ] Lint y build pasan en verde en CI.
- [ ] Si expone endpoints, están anotados con Swagger.
- [ ] Si publica eventos, el contrato está en [contratos-de-eventos.md](../arquitectura/contratos-de-eventos.md).
- [ ] Si es una decisión de arquitectura, tiene su ADR.
- [ ] Está mergeada a `main` y desplegada en el entorno correspondiente.

## Flujo de trabajo en Git

```
main            ← protegida. Solo entra vía PR aprobado y con CI en verde.
 └── develop    ← rama de integración del squad
      ├── feat/CU-01-alta-contenedores
      ├── feat/CU-05-deteccion-critico
      └── fix/...
```

**Convención de commits** (Conventional Commits, para que el historial de Git sea evidencia
presentable en la entrega):

```
feat(CU-05): detectar contenedor critico y publicar evento
test(CU-04): cobertura de validacion de lecturas
docs(adr): ADR-003 estrategia de integracion con el bus
fix(CU-10): validar radio GPS antes de confirmar parada
```

Cada commit referencia el CU. En la entrega, `git log --oneline` cuenta la historia del proyecto
por sí solo — eso es exactamente lo que evalúa la dimensión 10 de la rúbrica.

## Ceremonias

| Ceremonia | Cuándo | Facilitador |
|---|---|---|
| Sprint Planning | Al inicio de cada sprint | Tomás (SM) + Nicolás (PM) |
| Daily asincrónico | Diario, por el canal del squad | Todos |
| Sprint Review | Cierre de sprint, con demo | Nicolás (PM) |
| Retrospectiva | Cierre de sprint | Tomás (SM) |
