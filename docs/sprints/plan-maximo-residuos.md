# Mi plan · Residuos en el squad 3

**Caso:** termina un evento masivo y Residuos manda una escuadrilla a limpiar los tachos de la zona.
**Entrega:** jueves 19/11 (Hito 2).

## Lo que acordamos en el diagrama

Espacios publica `ActividadCreada` (fecha de finalización, estado, capacidad, ubicación en coordenadas).
Residuos reacciona: cuando termina el evento, manda una escuadrilla a limpiar los tachos de la zona.

## Pasos

| Cuándo | Qué hago | Listo cuando |
| --- | --- | --- |
| Hasta el 29/10 | 1. Recibir `ActividadCreada` y guardar la actividad con sus contenedores cercanos (300 m) | Un curl al webhook deja la actividad guardada |
| | 2. Mostrar la zona del evento en el mapa | Se ve la zona y la hora de fin |
| 30/10 al 12/11 | 3. A la hora de fin, armar el recorrido de la escuadrilla (reusa CU-08) | Sale el recorrido con los tachos de la zona |
| | 4. Que el chofer lo cierre (CU-10, ya existe) | El chofer confirma las paradas |
| | 5. Probarlo con el evento real que publica Rodrigo | Llega por el bus y funciona |
| 13/11 al 18/11 | 6. Tests, documentación y ensayo de la demo | Todo listo para el 19/11 |

## Antes de arrancar

- [ ] Mandar el mensaje al grupo 4 (voy a tocar `integracion` y el webhook)
- [ ] Crear la rama: `git switch -c feat/squad3-actividad-creada origin/develop`

## Lo que espero de otros

- **Nico (grupo 4):** ok para reusar su refuerzo de `EventoComunitarioPublicado`
- **Rodrigo (Espacios):** que publique `ActividadCreada` con coordenadas
- **Franco (EDA):** namespace `com.citypass.residuos` en el bus
- **Nicolas Hernandez (Login):** token de servicio (`client_credentials`)

Mientras no lleguen, pruebo todo en local.
