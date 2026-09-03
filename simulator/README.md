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
