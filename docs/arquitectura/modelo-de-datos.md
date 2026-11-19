# Modelo de datos — Squad 4 · Residuos

PostgreSQL 16 + TypeORM. Ver [ADR-002](../adr/ADR-002-persistencia.md).

## Diagrama entidad-relación

El modelo tiene 24 tablas. Este primer diagrama muestra el núcleo del módulo (sensores, alertas y
recolección); el de [integración con otros squads](#integración-con-otros-squads-y-eventos) muestra
las demás.

```mermaid
erDiagram
    ZONA ||--o{ CONTENEDOR : agrupa
    CONTENEDOR ||--|| SENSOR : "tiene instalado"
    CONTENEDOR ||--o{ LECTURA : registra
    CONTENEDOR ||--o{ ALERTA : genera
    CONTENEDOR ||--o{ PARADA : "es visitado en"
    CAMION ||--o{ RUTA : ejecuta
    RUTA ||--|{ PARADA : "se compone de"

    ZONA {
        uuid id PK
        string nombre
        jsonb barrioIds
        int umbralCriticoPct
        int umbralTemperaturaC
        boolean bloqueada
        boolean bloqueoManual
    }
    CONTENEDOR {
        uuid id PK
        string codigo UK
        uuid zonaId FK
        enum tipoResiduo
        int capacidadLitros
        decimal lat
        decimal lng
        enum estado
        decimal nivelLlenadoPct
        decimal temperaturaC
        timestamp ultimaLecturaEn
        boolean activo
    }
    SENSOR {
        uuid id PK
        string codigo UK
        uuid contenedorId FK
        string apiKeyHash
        enum estadoSensor
        int bateriaPct
        timestamp ultimoReporteEn
    }
    LECTURA {
        uuid id PK
        uuid contenedorId FK
        decimal nivelLlenadoPct
        decimal temperaturaC
        int bateriaPct
        timestamp registradaEn
        timestamp recibidaEn
    }
    ALERTA {
        uuid id PK
        uuid contenedorId FK
        enum tipo
        enum severidad
        enum estadoAlerta
        string detalle
        timestamp detectadaEn
        timestamp resueltaEn
    }
    CAMION {
        uuid id PK
        string patente
        int capacidadLitros
        enum tipoResiduoHabilitado
        enum estado
    }
    CHOFER {
        uuid id PK
        string nombre
        string legajo UK
        string usuarioSub UK
        boolean activo
    }

    RUTA {
        uuid id PK
        uuid camionId FK
        uuid choferId FK
        enum estado
        decimal distanciaEstimadaKm
        int litrosEstimados
        timestamp generadaEn
        timestamp asignadaEn
        timestamp completadaEn
    }
    PARADA {
        uuid id PK
        uuid rutaId FK
        uuid contenedorId FK
        int orden
        enum estado
        timestamp confirmadaEn
        timestamp omitidaEn
        string motivo
    }
```

### Integración con otros squads y eventos

Las líneas continuas son claves foráneas reales. Las punteadas son referencias que la base no
valida: listas de ids en `jsonb` o un id guardado sin FK.

```mermaid
erDiagram
    CONTENEDOR ||--o{ OBSTRUCCION_POR_RECLAMO : "tapado por"
    CONTINGENCIA ||--|{ CONTINGENCIA_ZONA : afecta
    ZONA ||--o{ CONTINGENCIA_ZONA : "incluida en"
    CONTINGENCIA ||--o{ CONTINGENCIA_CONTENEDOR : "vacía antes"
    CONTENEDOR ||--o{ CONTINGENCIA_CONTENEDOR : "incluido en"
    ALERTA_CLIMATICA_EXTERNA }o..o| CONTINGENCIA : "abre"
    INTERVENCION }o..o| CONTENEDOR : "en el lugar de"
    BLOQUEO_POR_INCIDENTE }o..o{ ZONA : "bloquea (zonaIds)"
    ACTIVIDAD_MASIVA }o..o{ CONTENEDOR : "refuerza (contenedorIds)"
    REFUERZO_EVENTO }o..o{ CONTENEDOR : "suma al ruteo (contenedorIds)"

    OBSTRUCCION_POR_RECLAMO {
        uuid id PK
        string reclamoId
        uuid contenedorId FK
        decimal distanciaMetros
        timestamp creadaEn
        timestamp venceEn
        timestamp resueltaEn
    }
    BLOQUEO_POR_INCIDENTE {
        string emergenciaId PK
        jsonb zonaIds
        boolean activo
        timestamp creadoEn
        timestamp actualizadoEn
    }
    INTERVENCION {
        uuid id PK
        string emergenciaId
        decimal lat
        decimal lng
        uuid contenedorId
        int distanciaMetros
        enum estado
        timestamp programadaEn
        timestamp completadaEn
    }
    ACTIVIDAD_MASIVA {
        string actividadId PK
        string titulo
        int capacidad
        float lat
        float lng
        timestamp inicio
        timestamp fin
        jsonb contenedorIds
    }
    ACTIVIDAD_SUSPENDIDA {
        string actividadId PK
        timestamp suspendidaEn
    }
    ACTIVIDAD_CANCELADA {
        string actividadId PK
        timestamp canceladaEn
    }
    REFUERZO_EVENTO {
        string eventoId PK
        string zona
        jsonb contenedorIds
        timestamp desde
        timestamp hasta
    }
    CONTINGENCIA {
        uuid id PK
        string alertaId
        string descripcion
        enum estado
        int revision
        timestamp iniciadaEn
        timestamp finalizadaEn
        timestamp recuperacionEn
        timestamp recuperadaEn
        uuid correlationId
    }
    CONTINGENCIA_ZONA {
        uuid contingenciaId PK, FK
        uuid zonaId PK, FK
    }
    CONTINGENCIA_CONTENEDOR {
        uuid contingenciaId PK, FK
        uuid contenedorId PK, FK
        timestamp vaciadoEn
    }
    ALERTA_CLIMATICA_EXTERNA {
        string alertaId PK
        jsonb confirmacion
        jsonb finalizacion
        uuid contingenciaId
        string decision
        string motivo
        string revisadoPor
        timestamp revisadaEn
        string origen
        timestamp recibidaEn
    }
    EVENTO_PENDIENTE {
        uuid eventId PK
        string eventType
        jsonb sobre
        enum estado
        int intentos
        string ultimoError
        timestamp proximoIntentoEn
        timestamp publicadoEn
        timestamp creadoEn
    }
    EVENTO_RECIBIDO {
        string eventId PK
        string eventType
        timestamp recibidoEn
    }
    EVENTO_CLIMATICO_RECIBIDO {
        uuid eventId PK
        string huella
    }
    ENTREGA_EDA {
        uuid eventId PK
        string huella
        string tipo
        jsonb metadata
        timestamp procesadaEn
    }
```

| Tabla | Para qué existe | Caso |
|---|---|---|
| `obstruccion_por_reclamo` | Un auto reclamado a 15 m o menos de un contenedor lo saca del ruteo hasta que se resuelve o vence | CU-INT-02 |
| `bloqueo_por_incidente` | Zonas bloqueadas mientras dura una emergencia o un incidente vial | CU-INT-01 |
| `intervencion` | Limpieza programada en el lugar de una emergencia resuelta | Caso de Adriel |
| `actividad_masiva`, `actividad_suspendida`, `actividad_cancelada` | Eventos masivos de Espacios y su suspensión o cancelación posterior | Casos de Máximo y Tomás |
| `refuerzo_evento` | Contenedores que entran al ruteo desde la hora de fin de un evento | Casos de Máximo y Tomás |
| `contingencia`, `contingencia_zona`, `contingencia_contenedor`, `alerta_climatica_externa` | Alertas climáticas, la decisión del operador y las zonas y contenedores afectados | Eventos climáticos (Ramiro) |
| `evento_pendiente` | Outbox transaccional: lo que se publica al bus sale de acá, con reintentos | Todos ([ADR-003](../adr/ADR-003-integracion-event-bus.md)) |
| `evento_recibido`, `evento_climatico_recibido`, `entrega_eda` | Deduplicación de lo que llega del bus, por `eventId` | Todos ([ADR-010](../adr/ADR-010-integracion-real-con-el-bus.md)) |

## Enumeraciones

| Enum | Valores |
|---|---|
| `TipoResiduo` | `COMUN`, `RECICLABLE`, `ORGANICO` |
| `EstadoContenedor` | `NORMAL` (verde), `ADVERTENCIA` (amarillo), `CRITICO` (rojo), `FUERA_DE_SERVICIO` |
| `EstadoSensor` | `ACTIVO`, `SIN_SENAL`, `BATERIA_BAJA`, `INACTIVO` |
| `TipoAlerta` | `SATURACION`, `INCENDIO`, `SENSOR_CAIDO`, `BATERIA_BAJA`, `ACCESO_BLOQUEADO` |
| `Severidad` | `BAJA`, `MEDIA`, `ALTA`, `CRITICA` |
| `EstadoAlerta` | `ABIERTA`, `EN_ATENCION`, `RESUELTA` |
| `EstadoCamion` | `DISPONIBLE`, `EN_RUTA`, `MANTENIMIENTO` |
| `EstadoRuta` | `PROPUESTA`, `ASIGNADA`, `EN_CURSO`, `COMPLETADA`, `CANCELADA` |
| `EstadoParada` | `PENDIENTE`, `CONFIRMADA`, `OMITIDA` |
| `EstadoContingencia` | `ACTIVA`, `PENDIENTE_RECUPERACION`, `EN_RECUPERACION`, `RECUPERADA` |
| `EstadoIntervencion` | `PROGRAMADA`, `COMPLETADA` |
| `EstadoEventoPendiente` | `PENDIENTE`, `PUBLICADO`, `FALLIDO` |

## Decisiones de modelado

**Ultima lectura desnormalizada en `CONTENEDOR`.** Los campos `estado`, `nivelLlenadoPct` y
`temperaturaC` duplican la ultima fila de `LECTURA`. Es deliberado, y por la misma razon que el
estado: el mapa de CU-07 y el listado de contenedores tienen que responder sin hacer JOIN contra
una tabla que crece ~48.000 filas por dia.

**Estado derivado y persistido a la vez.** `CONTENEDOR.estado` podría calcularse siempre desde la
última lectura, pero se persiste igual. Dos razones: el mapa de CU-07 necesita responder rápido sin
un JOIN contra una tabla de lecturas que crece sin freno, y CU-05 necesita conocer el estado
*anterior* para no re-emitir el evento cuando el contenedor ya estaba crítico.

**`LECTURA` es append-only.** Nunca se actualiza ni se borra. Es la fuente de verdad histórica y el
insumo del modelo predictivo de CU-12. Con 500 contenedores reportando cada 15 minutos crece a
~48.000 filas diarias, así que lleva índice compuesto:

```sql
CREATE INDEX idx_lectura_contenedor_fecha ON lectura (contenedor_id, registrada_en DESC);
```

Ese índice sirve a los dos accesos calientes: "última lectura de este contenedor" (CU-05, CU-07) y
"últimas N lecturas de este contenedor" (CU-12).

**`ALERTA` se separa de `CONTENEDOR`.** Un contenedor puede tener varias alertas simultáneas de
distinto tipo (saturado y con batería baja a la vez) y necesitamos su ciclo de vida propio
(abierta → en atención → resuelta) para el tablero del operador.

**`SENSOR` es entidad aparte aunque la relación sea 1:1.** El sensor tiene ciclo de vida propio:
se rompe, se reemplaza, se recalibra. Además guarda su `apiKeyHash`, que es una credencial y no
debe convivir con datos de ubicación pública ([ADR-005](../adr/ADR-005-seguridad-identidad.md)).

**`RUTA.choferId` es una clave foránea a `CHOFER`.** Durante los primeros sprints fue texto libre,
bajo el supuesto de que los choferes eran usuarios del módulo de identidad del Squad 2 y que
mantener una copia acá solo se desincronizaría. Ese supuesto cambió: los choferes son entidades de
este módulo, no se registran ni inician sesión contra el Squad 2.

El costo de que fuera texto libre era concreto: nadie validaba nada, así que un identificador mal
tipeado asignaba la ruta **con éxito** y el chofer no la veía nunca.

`CHOFER.usuarioSub` es lo único que une a la persona con su sesión: `GET /rutas/mias` resuelve por
ahí. Es nullable porque un chofer puede existir en la operación antes de que alguien le configure
el acceso.

**Preparado para los alcances completos.** `ZONA` puede recibir una columna `geometry` (PostGIS)
sin migrar datos si algún día se implementa CU-02 completo, y `PARADA.confirmadaEn` ya contempla
la marca temporal que necesitaría una cola offline de CU-10.
