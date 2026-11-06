# Resumen para la exposición · Residuos en el squad 3

## El caso en una frase

Termina un evento masivo y Residuos manda una escuadrilla a limpiar los tachos de la zona, sin que nadie le avise: **reacciona a un hecho que publica Espacios.**

## Qué recibe Residuos

- **`com.citypass.espacios.ActividadCreada`** (de Espacios), por el bus, al webhook de Render.
- Trae: id, título, capacidad, inicio y fin, y la ubicación (lat, lng).

## Qué hace con eso

1. **Filtra:** solo actividades de **1.000 personas o más**.
2. **Busca los tachos a 300 m** o menos de la ubicación.
3. **Muestra la zona en el mapa**, con el aviso y la cuenta regresiva.
4. **Cuando termina el evento, y durante 6 horas,** esos tachos entran a la ruta aunque estén vacíos.
5. **El operador genera la ruta y la asigna** a un camión y a un chofer.

## Qué publica Residuos

- **`com.citypass.residuos.IntervencionProgramada`**, al asignar la ruta.
- Va con `causaTipo = EVENTO_PUBLICO`, el camión, el tacho y sus coordenadas. `alertaId` va en null.
- **La lee Analítica**, para medir las intervenciones por evento.

## Decisiones clave y su porqué

| Decisión | Por qué |
|---|---|
| Residuos **reacciona**, Espacios no le da órdenes | Cada módulo decide qué hacer con un hecho: no hay acople entre ellos |
| Corte de **1.000 personas** y radio de **300 m** | Son los mismos que usan Reclamos y Movilidad: todo el squad habla de la misma zona |
| Los tachos entran a la ruta **aunque no estén llenos** | Después de un festival se van a llenar seguro: conviene pasar antes |
| Ventana de **6 horas** después del fin | Es el rato en que la escuadrilla tiene sentido; después vuelve la ruta normal |
| La ruta **la confirma una persona** | El sistema propone, el operador decide camión y chofer |
| `IntervencionProgramada` sale **al asignar** | Recién ahí se sabe qué camión va: Analítica necesita `camionId` |
| `causaTipo` con **los mismos valores que Emergencias** | Analítica separa los casos con un solo campo (EVENTO_PUBLICO, RESERVA, etc.) |
| Publicar con **outbox** | El evento se guarda en la misma transacción que la ruta: si el bus se cae, se reintenta y no se pierde |
| Webhook con **token** y sin repetidos (por `eventId`) | El bus entrega al menos una vez: si manda dos veces lo mismo, no se arma dos veces la zona |

## Plan B de la demo

Si el bus o Espacios fallan en vivo, un script manda el mismo `ActividadCreada` al webhook. La historia sigue igual.

## Lo que ya está probado (06/11)

Prueba completa en Render, en la sede de Recoleta: la zona apareció en el mapa, CT-0022 entró a la ruta al 0%, y `IntervencionProgramada` quedó en el bus con `EVENTO_PUBLICO`.
