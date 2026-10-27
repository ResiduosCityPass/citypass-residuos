# Guion de la demo — Hito 2 (19/11) · parte de Residuos

> **Caso del squad 3:** "Recolección inteligente después de un evento masivo".
> Espacios publica `ActividadCreada` y cada módulo reacciona. Residuos manda una escuadrilla a
> limpiar los contenedores de la zona cuando termina el evento.

**Duración objetivo: unos 4 minutos** (ajustar cuando el squad reparta los tiempos).
Se ensaya entera al menos una vez el día anterior.

---

## La historia

> Espacios publica un festival de 5.000 personas → Residuos lo recibe por el bus → la zona aparece
> en el mapa con la cuenta regresiva → termina el festival → el operador genera la ruta y los
> tachos de la plaza entran aunque no estén llenos → el chofer la cierra.

La idea a dejar clara: **Residuos no recibe órdenes de Espacios, reacciona a un hecho.** Espacios
no sabe que existimos; solo publica que se creó una actividad.

---

## Antes de empezar

### El día anterior

- [ ] El #57 está en `main` y desplegado en Render (Render despliega `main`).
- [ ] La suscripción al bus está activa: `npm run bus -- listar` la muestra.
- [ ] Hay un camión y un chofer de prueba con ruta vacía.
- [ ] No quedan rutas en `PROPUESTA` ni actividades de ensayos que tapen el mapa: los contenedores
      de una ruta viva quedan fuera del ruteo nuevo.
- [ ] Elegir **el contenedor de la plaza** (que no esté crítico) y anotar su código y sus
      coordenadas. Es el que entra a la ruta gracias a la escuadrilla.

### Diez minutos antes

1. Despertar la API: abrir `/api/v1/health` en Render. Dormida tarda más de 15 s y el bus solo
   espera unos segundos: el evento terminaría en la cola de fallidos.
2. Abrir dos pestañas: el **mapa** (operador) y **`/chofer`** (chofer).
3. Dejar una terminal abierta en `simulator/` con el comando del plan B ya escrito.

---

## Paso a paso

### 1. Llega el evento (30 s)

**Con el bus real:** Rodrigo crea la actividad en Espacios, con la ubicación de la plaza y la
hora de fin en 2 minutos.

**Plan B (si el bus o Espacios fallan):** el script hace de Espacios y manda el mismo evento al
webhook:

```bash
cd simulator
API_URL=<api-de-render>/api/v1 WEBHOOK_TOKEN=<el-de-render> npm run actividad -- --lat <lat> --lng <lng> --termina-en 2
```

En Render se usa `--lat` y `--lng` porque `--contenedor` necesita un token de administrador. En
local alcanza con `TOKEN=<token> npm run actividad -- --contenedor CT-0005 --termina-en 2`.

**Qué decir:** "Espacios publicó `ActividadCreada` en el bus. No nos llamó a nosotros: lo
publicó, y cada módulo del squad decide qué hacer."

### 2. La zona en el mapa (1 min)

- Apretar **"Refrescar ahora"** (si no, aparece con el próximo refresco, a los 30 s).
- Se ve el **círculo azul de 300 m** y el aviso: *"Actividad masiva: Festival de Primavera ·
  5.000 personas · Termina a las 20:00 (en 2 min) · 1 contenedor en la zona"*.

**Qué decir:** "Solo reaccionamos a eventos de 1.000 personas o más. Buscamos los contenedores a
300 m o menos: esos son los que va a limpiar la escuadrilla. El corte de 1.000 personas y los
300 m son los mismos que usan Reclamos y Movilidad, así todo el squad habla de la misma zona."

### 3. Termina el evento: la escuadrilla (1 min)

- Esperar a que el aviso diga *"Terminó a las 20:00"* y refrescar.
- Ir a **Rutas** y generar la ruta para el camión.
- Mostrar que el **contenedor de la plaza** está en la ruta aunque esté en verde.

**Qué decir:** "Desde que termina el evento y durante 6 horas, los tachos de la zona entran a la
ruta aunque no estén llenos. Después de un festival se van a llenar seguro. La ruta la confirma
el operador, como siempre: el sistema propone y una persona decide camión y chofer."

### 4. El chofer la cierra (1 min)

- Asignar la ruta al chofer.
- En `/chofer`, confirmar las paradas. Cada una se confirma desde la posición del contenedor: el
  backend valida que el chofer esté a menos de 100 m. Para simularlo, usar Chrome DevTools →
  Sensors → Location con las coordenadas del contenedor.
- La ruta pasa a **COMPLETADA** y los contenedores quedan vacíos.

**Cierre:** "Un evento de otro módulo terminó en un camión vaciando los tachos de la plaza, sin
que nadie tuviera que avisarnos."

---

## Si algo falla en vivo

| Qué pasa | Qué hacer |
|---|---|
| El evento no aparece en el mapa | Refrescar. Si sigue sin aparecer, `npm run bus -- fallidos`; si tarda, pasar al plan B |
| El bus o Espacios no responden | Plan B: el script, mismo evento, misma historia |
| La ruta sale sin el tacho de la plaza | El evento no terminó todavía (la escuadrilla arranca a la hora de fin) o el tacho está en otra ruta viva |
| "No hay contenedores para la ruta" | Hay una ruta en `PROPUESTA` colgada: descartarla y generar de nuevo |
| El chofer no puede confirmar | La ubicación de DevTools no es la del contenedor |

---

## Ensayos

| Fecha | Dónde | Resultado |
|---|---|---|
| 27/10 | Local, por API | Pasos 1 a 3: con la actividad ya terminada al lado de CT-0005, la ruta del camión de reciclables salió con CT-0005 al 0 %. Paso 4 sin repetir (probado el 22/10). Falta el ensayo con el bus real y la pantalla |
