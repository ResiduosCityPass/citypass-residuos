# Login e inundaciones integrados con develop — 03/11/2026

La rama `feat/inundaciones-login-eda` incorpora `develop` hasta `870e30b` (#51–#68).
El [PR #71](https://github.com/ResiduosCityPass/citypass-residuos/pull/71)
reemplaza el PR #70 y se revisa contra `develop`; el release posterior a `main` queda
separado. No se ejecutó un despliegue al preparar esta integración.

## Un solo bus

- `GatewayTransporte` publica el outbox, consulta el catálogo y obtiene el token
  compartido con SASL. Conserva las traducciones de Analítica, Reclamos,
  Emergencias y refuerzos; agrega las cuatro respuestas climáticas.
- `CitypassKafkaConsumer` recibe todos los eventos. Entrega clima a su inbox con
  hash por medio de `IntegracionService`; webhook y Kafka comparten procesamiento.
- No hay cliente, token o consumidor `EDA_*` paralelo. `KAFKA_BROKERS` vacío
  deshabilita Kafka. `GATEWAY_URL` es la raíz HTTPS, **sin `/api/v1`**;
  `GATEWAY_TOKEN_URL` incluye `/oauth/token`.
- Se conserva `fromBeginning=false`. El grupo operativo es
  `com.citypass.residuos.api`; local debe usar otro grupo. Los offsets existentes
  se respetan. Fallos transitorios no confirman; contratos inválidos se registran
  y descartan para no bloquear la partición, como en #68.
- Los simulacros propios requieren `CLIMA_SIMULACRO_EDA_HABILITADO=true`, solo en
  desarrollo/test. El registro CLI propone únicamente los cuatro schemas
  climáticos; no cambia ni borra tipos registrados anteriormente.

## Convivencia de casos de uso

La recuperación incluye contenedores no críticos y respeta bloqueos manuales,
emergencias, obstrucciones, reservas en rutas vivas y refuerzos de eventos masivos.
Las omisiones automáticas por Emergencias/Reclamos pueden retirar una parada
bloqueada sin registrar un vaciado ni completar la recuperación.
Los grupos `residuos-administradores` y `residuos-operadores` de develop se
conservan; `delegados` sigue siendo OPERADOR, sin permisos de administrador.

## Validación reproducible

- Backend: 761 tests unitarios; cobertura de líneas 89,97 %.
- PostgreSQL local en base exclusiva de tests: 144 E2E, incluidas migraciones,
  gateway HTTP/Avro, Login, obstrucciones y bloqueo simultáneo por emergencia.
- Frontend: 407 tests; cobertura de líneas 94,21 %.
- Lint, TypeScript, builds y verificador del Blueprint correctos.
- Verificación remota: el cliente compartido obtuvo token y catálogo; Kafka/TLS
  en `test.citypass.mrfranco.net.ar:9092` devolvió metadata de los dos tópicos
  climáticos. Esta comprobación no publicó mensajes ni movió offsets.

Render quedó preparado con `GATEWAY_*`/`KAFKA_*` y un solo secreto de servicio,
guardando sin desplegar. JWT interno, base restaurada y secreto del webhook se
conservaron. Simuladores apagados en producción. El ensayo completo desde la web
de Espacios Públicos sigue dependiendo de su publicación, documentada aparte.
