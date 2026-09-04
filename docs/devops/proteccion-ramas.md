# Proteccion de ramas

Configuracion recomendada para `main` y `develop` en GitHub.

## Objetivo

Evitar merges accidentales cuando hay PRs relacionados, impedir pushes directos y asegurar que
nadie mergee sin esperar las validaciones del pipeline.

## Ramas protegidas

Aplicar la misma regla a:

- `main`
- `develop`

## Reglas requeridas

- Requerir pull request antes de mergear.
- Requerir al menos 1 aprobacion.
- Descartar aprobaciones cuando se suben nuevos commits al PR.
- Requerir que las conversaciones esten resueltas antes de mergear.
- Requerir status checks en verde antes de mergear.
- Bloquear pushes directos a la rama.
- No permitir bypass salvo administradores del repositorio.

## Status checks requeridos

Marcar como obligatorios los jobs del workflow `CI`:

- `Backend — lint, build, unitarios e integrales`
- `Frontend — lint, build y tests`
- `Docker — build de imagenes`

## Pasos en GitHub

1. Entrar a `Settings`.
2. Ir a `Rules` y despues `Rulesets`.
3. Crear un ruleset para ramas.
4. Agregar como targets `main` y `develop`.
5. Activar las reglas de pull request, aprobacion y status checks.
6. Guardar el ruleset en modo `Active`.

## Criterio operativo

Las ramas de feature se mergean primero a `develop`. Cuando `develop` esta estable y con CI verde,
se abre un PR de `develop` hacia `main`.
