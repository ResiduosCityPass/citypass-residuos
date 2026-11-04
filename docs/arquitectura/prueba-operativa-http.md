# Ensayo operativo de inundación por HTTP

Este flujo prepara los datos de la demo usando las APIs de Residuos. Sirve en
Render Free sin Shell, sin abrir PostgreSQL a Internet y sin conocer `JWT_SECRET`.
No reemplaza la publicación de la alerta desde Espacios Públicos.

El escenario contiene dos zonas, tres contenedores con niveles 90/30/85 %, tres
sensores nuevos, un camión, un chofer y una ruta asignada al contenedor del 90 %.
El control del 85 % queda en la otra zona. Los nombres llevan `DEMO-<escenario>`.

## Preparación

Desde `backend`, copiar `.env.demo.http.example` como `.env.demo.http.local`, con
permisos `0600`, y completar la cuenta administradora de Residuos. El archivo está
ignorado por Git. El comando inicia una sesión legítima en Login y solicita su
cierre al terminar; no fabrica tokens humanos. Para verificar alcanza el rol
OPERADOR. El rol ADMINISTRADOR se exige antes de crear recursos.

Elegir un nombre nuevo (1–10 letras/números, comienza con letra) y una patente
Mercosur de ensayo que no exista. Ver primero el plan: no usa credenciales ni red.

```bash
npm run demo:http -- plan --escenario WEB01 --patente QA123ZZ \
  --api https://citypass-residuos-api.onrender.com/api/v1
```

Cuando esté disponible la cuenta administradora:

```bash
npm run demo:http -- preparar --escenario WEB01 --patente QA123ZZ \
  --api https://citypass-residuos-api.onrender.com/api/v1 --apply
```

El directorio privado `.demo/http/WEB01/` contiene:

- `escenario.json`: API, IDs, coordenadas sintéticas y niveles iniciales; sin secretos.
- `registro.json`: recursos creados y estado PREPARADA o INCOMPLETA.
- `chofer.jwt`: credencial interna emitida por la API, permisos `0600`; nunca se
  imprime. Usa la vigencia normal del endpoint de choferes (actualmente 30 días).

La preparación HTTP publica los eventos normales de lecturas y rutas a través
del dominio/outbox, a diferencia del bootstrap directo de PostgreSQL. No publica
eventos climáticos ni modifica datos ajenos, permisos LDAP o flags del despliegue.
La generación de la ruta se filtra por la zona propia y valida que solo incluya
el contenedor crítico del escenario.

Las altas HTTP son operaciones separadas: no existe una transacción global que
las revierta juntas. Ante un error se conserva el registro de altas realizadas.
No hay reintentos automáticos de escritura, borrados, rotaciones de credenciales
previas ni reposición de llenados. Si el nombre, patente o legajo ya existe, o el
directorio local ya está reservado, se detiene. Ante una ejecución incompleta,
revisar su registro antes de decidir cómo continuar; no ejecutarla repetidamente.

## Recorrido y verificaciones

Este comando solo hace GET y sale con código distinto de cero si una condición
no se cumple. No confirma una etapa porque la pantalla diga que terminó: compara
llenados, restricciones, estados de paradas, las dos rutas y evidencia de vaciado.

```bash
npm run demo:http -- verificar --directorio .demo/http/WEB01 \
  --api https://citypass-residuos-api.onrender.com/api/v1 --etapa preparada
```

1. **Preparada:** una parada pendiente al 90 %, el segundo contenedor al 30 % y
   el control al 85 %, sin restricciones en las dos zonas del escenario.
2. Crear y confirmar una alerta nueva en Espacios Públicos, identificada como
   SIMULACRO académico. Usar el mismo `alertaId` al finalizar. Esperar a que llegue
   por EDA y revisar la afectación en Residuos. Seleccionar **solo**
   `DEMO-WEB01 Centro`, dejando explícito el carácter sintético del ensayo.
3. **Suspendida:** ejecutar el verificador con `--etapa suspendida --alerta ID`.
   Debe haber una parada suspendida, dos contenedores pendientes (incluye al no
   crítico), llenados intactos y el control sin restricciones. Un intento de
   confirmar la parada con el chofer debe responder 409.
4. Finalizar esa alerta desde Espacios. **Finalizada:** verificar con
   `--etapa finalizada --alerta ID`. El estado debe ser PENDIENTE_RECUPERACION;
   la parada sigue suspendida y el intento de vaciado sigue dando 409.
5. Habilitar la recuperación como operador en Residuos. **Habilitada:** verificar
   con `--etapa habilitada --alerta ID`. El estado debe ser EN_RECUPERACION, sin
   restricciones de esta inundación y con los dos llenados todavía intactos.
6. Confirmar la parada del 90 % con la credencial del chofer del escenario.
   **Primer-vaciado:** verificar con `--etapa primer-vaciado --alerta ID`.
   Debe quedar 0/30/85 %, una ruta completada y la contingencia aún EN_RECUPERACION.
7. Generar una segunda ruta con ese camión, filtrando la zona Centro del
   escenario. Debe incluir **solo el contenedor al 30 %**. Asignarla al mismo
   chofer y confirmar su vaciado. **Recuperada:** verificar con
   `--etapa recuperada --alerta ID`. Exige ambas paradas CONFIRMADAS, las dos rutas
   COMPLETADAS, evidencia `vaciadoEn` en ambos impactos, niveles 0/0/85 % y
   contingencia RECUPERADA. Omitir una parada no satisface la prueba.

En todas las etapas se usa el mismo comando de verificación, cambiando `--etapa`
y agregando `--alerta` con el ID real, sin los caracteres de marcador `ID`.
Los IDs de contingencia y zona se muestran en el resultado de la verificación.

La web de producción mantiene deshabilitada la simulación GPS. Para un ensayo
con datos sintéticos puede enviarse `PATCH /paradas/:id/confirmar` con el token
interno de **ese chofer de prueba** y las coordenadas del contenedor indicadas en
el manifiesto. Esto prueba el endpoint y su control de distancia; no acredita la
geolocalización del navegador. No habilitar un flag global para esta prueba.
Tras completar ambas rutas, el administrador puede dar de baja lógicamente al
chofer de ensayo para revocar su credencial conservando la evidencia histórica.

## Respuestas en EDA

Con el perfil de servicio existente (no la cuenta humana) y el cliente de gateway
compartido del proyecto:

```bash
ENV_FILE=.env.integration.local npm run eda:auditar -- \
  --alerta ID --inundacion ID_CONTINGENCIA --zona ID_ZONA_CENTRO
```

Es una consulta de solo lectura a los últimos 50 eventos de nuestra cuenta.
Exige ServicioAfectado, RecuperacionPendiente, RecuperacionHabilitada y
ServicioRestablecido con el cliente emisor, correlación, contingencia, zona y
estado esperados. No registra tipos, no publica mensajes ni consume Kafka.
Si una respuesta no está en esa ventana, el comando falla sin afirmar si se
perdió la entrega o quedó fuera del listado. Auditar al terminar el ensayo.

Esta comprobación de EDA por sí sola no acredita vaciados: debe pasar también la
etapa HTTP `recuperada` sobre el escenario con trabajo pendiente.

## Validación local

`test/demo-http.e2e-spec.ts` prepara el escenario mediante las mismas APIs y prueba
el recorrido completo en PostgreSQL migrado. La entrada EDA se entrega al servicio
de recepción dentro del test; no contacta Espacios ni el bus externo. Incluye
rechazo de recuperación anticipada y del GPS fuera de radio, ambos vaciados y
las cuatro respuestas en el outbox. Los unit tests cubren permisos, colisiones,
destinos HTTP y errores de correlación, incluyendo falsos positivos por omisión
o cambios en el contenedor de control.

Validación del 3 de noviembre de 2026: 799 tests unitarios y 27 E2E de las cuatro
suites de demo/inundaciones pasaron, además de lint y compilación. La cobertura
combinada de unitarios y E2E alcanza el 100 % en líneas, funciones y ramas de los
tres helpers nuevos de preparación, cliente HTTP y auditoría EDA; los entrypoints
CLI conservan la exclusión de cobertura existente del proyecto. El E2E también
ejecuta el CLI, verifica permisos de archivos y comprueba que una repetición no
sobrescriba ni invalide la credencial del chofer.

La auditoría de solo lectura también pasó contra las cuatro respuestas del caso
desplegado `bba18974-ee18-444f-80b7-8ddc0408f9d6`. Ese caso previo no tenía trabajo
de recolección pendiente; no reemplaza el ensayo desplegado con los niveles
90/30/85 %, que sigue pendiente de una cuenta administradora.
