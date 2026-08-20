# Simulador de sensores IoT

Alimenta `POST /api/v1/lecturas` como si fueran los sensores reales instalados dentro de los
contenedores. Sin esto no hay forma de demostrar CU-04, CU-05 ni CU-06: el módulo entero se
dispara a partir de las lecturas.

Se implementa en el Sprint 1, después de que exista el endpoint de ingesta.

## Comportamiento previsto

- Lee la lista de contenedores registrados y su API key de sensor.
- Emite una lectura por contenedor cada N segundos (configurable; en producción el intervalo real
  es de 15 minutos, para la demo conviene mucho menos).
- El nivel de llenado crece de forma monótona con ruido aleatorio, y se reinicia a un valor bajo
  cuando el contenedor es vaciado. Esa monotonía es lo que hace que la regresión lineal de CU-12
  tenga algo que predecir.
- Modos de escenario para la demo:
  - `normal` — llenado gradual
  - `saturacion` — fuerza a un contenedor a superar el umbral, dispara CU-05
  - `incendio` — sube la temperatura de golpe, dispara CU-06
  - `sensor-caido` — deja de reportar, dispara la alerta de sensor sin señal

Los modos de escenario importan más de lo que parecen: en la demo final hay que poder provocar
un incendio a voluntad para mostrar la integración con Emergencias (Squad 6). Esperar a que
ocurra por azar no es una opción.
