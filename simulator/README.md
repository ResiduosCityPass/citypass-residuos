# Simulador de sensores IoT

Alimenta `POST /api/v1/lecturas` como si fueran los sensores reales instalados dentro de los
contenedores. **Sin esto no se puede demostrar CU-04, CU-05 ni CU-06:** el módulo entero se
dispara a partir de las lecturas.

No tiene dependencias: usa el `fetch` nativo de Node 22.

## Puesta en marcha

Con el backend corriendo, generá un token de administrador y sembrá el escenario:

```bash
cd ../backend && npm run token:dev -- ADMINISTRADOR
```

```bash
TOKEN=<el-token-de-arriba> npm run seed
```

El seed crea una zona (umbral 70%), 4 contenedores alrededor del Obelisco y sus sensores, y
guarda las API keys en `sensores.json` —que está en `.gitignore`, porque son credenciales.

Después:

```bash
npm start
```

## Escenarios

Cada escenario le pega a **un** contenedor; el resto se llena normal. Por defecto es el primero de
la lista, y con `--contenedor` se elige otro.

| Comando | Qué provoca |
|---|---|
| `npm start` | Llenado gradual de todos |
| `npm run saturacion` | Fuerza a CT-0001 por encima del umbral → dispara **CU-05** |
| `npm run incendio` | Dispara la temperatura de CT-0001 → dispara **CU-06** |
| `node simulador.js --escenario incendio --contenedor CT-0007` | Lo mismo, sobre otro contenedor |
| `node simulador.js --escenario bateria` | Descarga el sensor de CT-0001 |

Opciones: `--intervalo <segundos>` (por defecto 5), `--contenedor <codigo>` y `--reiniciar`. En
producción el intervalo real es de 15 minutos; para la demo conviene mucho menos.

**`--contenedor` existe por la demo.** Los dos escenarios que se muestran —saturación e incendio—
caían sobre el mismo contenedor, y ahí el remate se cae solo: el punto de CU-06 es que un
contenedor **verde** puede estar prendido fuego, porque el incendio se evalúa contra la temperatura
y no contra el llenado. Si es el mismo que acabás de saturar, está rojo, y no se puede mostrar que
las dos reglas son independientes.

## Actividad masiva (caso transversal del squad 3)

Simula a Espacios publicando `com.citypass.espacios.ActividadCreada`: le pega al webhook de
Residuos igual que lo haría el bus. Sirve para la demo y como plan B si el bus o Espacios se caen
en vivo.

```bash
TOKEN=<token-de-administrador> npm run actividad -- --contenedor CT-0005
```

Arma un "Festival de Primavera" de 5.000 personas al lado de CT-0005, que empezó hace 3 h y
termina en 10 minutos. En el mapa aparece la zona con la cuenta regresiva y, cuando termina, los
contenedores de la zona entran a la próxima ruta que se genere.

| Opción | Qué hace |
|---|---|
| `--contenedor <codigo>` | Arma la actividad al lado de ese contenedor (necesita `TOKEN`) |
| `--termina-en <minutos>` | Cuándo termina; `0` = ya terminó y la escuadrilla puede salir ya. Default 10 |
| `--titulo`, `--capacidad` | Default "Festival de Primavera", 5000 |
| `--lat`, `--lng` | Ubicación a mano, sin `--contenedor`. Default el Obelisco |

Usa `WEBHOOK_TOKEN` (default `local-dev`), que tiene que coincidir con `GATEWAY_WEBHOOK_TOKEN` del
backend. Sin `--contenedor` la actividad cae en el Obelisco, pero el seed reparte los contenedores
hasta a 1 km, así que puede quedar sin ninguno dentro de los 300 m.

## Suscribirse al bus real

`bus.js` da de alta el webhook de Residuos en Render para que el bus le mande `ActividadCreada`.
No es un simulador: habla con el bus de verdad.

```bash
BUS_URL=<url-del-bus> CLIENT_ID=<id> CLIENT_SECRET=<secreto> WEBHOOK_TOKEN=<el-de-render> npm run bus -- suscribir
```

| Comando | Qué hace |
|---|---|
| `suscribir` | Prueba que el webhook de Render responda y lo registra. Devuelve el `id` |
| `listar` | Las suscripciones de Residuos, y si el bus silenció alguna |
| `fallidos` | Los eventos que el bus no pudo entregar, con el error |
| `baja <id>` | Da de baja una suscripción |

`--topico` cambia el tipo de evento (default `com.citypass.espacios.ActividadCreada`). En vez de
`CLIENT_ID` y `CLIENT_SECRET` se puede pasar un token ya emitido en `BUS_TOKEN`. Los pasos completos
para Render están en `docs/sprints/plan-maximo-residuos.md`.
## Reclamo por un auto que bloquea la bicisenda (CU-INT-02)

`reclamo.js` hace de módulo de Reclamos: le manda al webhook de Residuos los mismos eventos que
mandaría el gateway, con el formato del contrato de Reclamos del 22/10. Sirve para la demo sin
depender de que ellos estén publicando. Guion completo en `docs/sprints/guion-demo-reclamos.md`.

Necesita una ruta `EN_CURSO` o `ASIGNADA`, el token de administrador y el
`GATEWAY_WEBHOOK_TOKEN` del backend:

```bash
TOKEN=<jwt> WEBHOOK_TOKEN=webhook-local npm run reclamo
```

| Comando | Qué provoca |
|---|---|
| `npm run reclamo` | Un auto a ~5 m de la próxima parada pendiente: la parada se omite y la ruta se reordena |
| `npm run reclamo -- --lejos` | El auto a ~100 m: no tapa nada, `afectaRecoleccion: false` |
| `npm run reclamo -- --ruta <id>` | Elige la ruta en vez de tomar la primera activa |
| `npm run reclamo:resuelto` | Reclamos avisa que se retiró el auto (usa el último reclamo enviado) |

El id del último reclamo queda en `ultimo-reclamo.txt`, que no se versiona.

## El nivel sobrevive entre corridas

Los niveles se guardan en `estado.json` al final de cada ciclo y se recuperan al arrancar. Sin eso
cada corrida volvía al `nivelInicial` del seed: encadenar dos escenarios hacía que el contenedor
recién saturado reportara su nivel viejo y **volviera a verde solo**, en vivo y sin que nadie lo
vaciara. Eso se lee como un bug aunque no lo sea.

```bash
node simulador.js --reiniciar   # ignora lo guardado y arranca del seed
```

`estado.json` no se versiona.

Los escenarios importan más de lo que parece: **en la demo final hay que poder provocar un
incendio a voluntad** para mostrar la integración con Emergencias (Squad 6). Esperar a que
ocurra por azar no es una opción.

## Cómo se lee la salida

```
[07:49:49] escenario: saturacion
  CT-0001   76.0%   20.9C  bat 100% NORMAL -> CRITICO  ALERTAS: SATURACION
  CT-0002    5.3%   25.6C  bat 100%
```

La columna de transición y la de alertas solo aparecen cuando algo cambió. Si CT-0001 sigue
subiendo por encima del umbral y **no** vuelve a aparecer `ALERTAS`, la deduplicación de CU-05
está funcionando: el evento se emite solo en la transición, no en cada lectura.

## Comportamiento del modelo

El nivel de llenado crece de forma monótona con ruido (entre 0,5% y 3% por ciclo). Esa monotonía
es deliberada: es lo que le da algo que predecir a la regresión lineal de CU-12.
