# Diagramas — Módulo de Gestión de Residuos Inteligente

**CityPass+ · Squad 4 · UADE, 2C 2026**

Todos los diagramas están en Mermaid dentro del repositorio, no como imágenes exportadas. La razón
es simple: un diagrama que vive en un archivo aparte miente a las dos semanas. Estos se editan en
el mismo commit que el código que describen, y GitHub los renderiza solo.

| Diagrama | Qué muestra |
|---|---|
| [1. Casos de uso](#1-diagrama-de-casos-de-uso) | Los 12 CU y sus actores |
| [2. Contexto (C4 nivel 1)](#2-contexto--c4-nivel-1) | El módulo dentro de CityPass+ |
| [3. Contenedores (C4 nivel 2)](#3-contenedores--c4-nivel-2) | Las piezas internas del módulo |
| [4. Arquitectura de eventos](#4-arquitectura-de-eventos) | Productores, canales y consumidores |
| [5. Secuencia: ingesta y detección](#5-secuencia--ingesta-y-detección-cu-04-cu-05-cu-06) | CU-04, CU-05, CU-06 |
| [6. Secuencia: ciclo de recolección](#6-secuencia--ciclo-de-recolección-cu-08-cu-09-cu-10) | CU-08, CU-09, CU-10 |
| [7. Máquinas de estado](#7-máquinas-de-estado) | Contenedor, alerta y ruta |
| [Entidad-relación](modelo-de-datos.md) | En su propio documento, junto al modelo |

---

## 1. Diagrama de casos de uso

Doce casos de uso y cinco actores. **El sensor es un actor no humano**: se autentica con una API
key y no con una sesión de usuario, y es el único que dispara casos de uso sin que haya nadie
apretando un botón.

```mermaid
flowchart LR
    admin["Administrador"]
    operador["Operador"]
    chofer["Chofer"]
    ciudadano["Ciudadano"]
    sensor["Sensor IoT"]

    subgraph configuracion["Configuración"]
        cu01(("CU-01<br/>Registrar contenedor<br/>y sensor"))
        cu02(("CU-02<br/>Definir zonas<br/>y umbrales"))
        cu03(("CU-03<br/>Gestionar flota"))
    end

    subgraph automatico["El sistema trabaja solo"]
        cu04(("CU-04<br/>Reportar nivel<br/>de llenado"))
        cu05(("CU-05<br/>Detectar contenedor<br/>crítico"))
        cu06(("CU-06<br/>Detectar riesgo<br/>de incendio"))
        cu12(("CU-12<br/>Predecir<br/>saturación"))
    end

    subgraph operacion["Operación"]
        cu07(("CU-07<br/>Ver mapa<br/>en tiempo real"))
        cu08(("CU-08<br/>Generar<br/>ruta óptima"))
        cu09(("CU-09<br/>Asignar ruta a<br/>camión y chofer"))
    end

    subgraph campo["En la calle"]
        cu10(("CU-10<br/>Confirmar<br/>vaciado"))
        cu11(("CU-11<br/>Consultar contenedores<br/>cercanos"))
    end

    admin --> cu01
    admin --> cu02
    admin --> cu03

    sensor --> cu04
    cu04 -. incluye .-> cu05
    cu04 -. incluye .-> cu06

    operador --> cu07
    operador --> cu08
    operador --> cu09
    operador --> cu12
    cu08 -. usa .-> cu12

    chofer --> cu10
    ciudadano --> cu11

    admin -.- operador
```

**Dos relaciones que vale leer con atención:**

- **CU-04 incluye CU-05 y CU-06.** Cada lectura que entra dispara la evaluación de ambas reglas.
  No son casos de uso que alguien invoque: ocurren como consecuencia de la ingesta.
- **CU-08 usa CU-12.** El ruteo considera los contenedores críticos de hoy más los que la
  predicción indica que van a cruzar el umbral durante el turno.

---

## 2. Contexto — C4 nivel 1

Dónde vive nuestro módulo dentro de la plataforma, y con quién habla.

```mermaid
flowchart TB
    operador["Operador municipal"]
    vecino["Vecino"]
    chofer2["Chofer"]

    residuos["<b>Módulo de Residuos</b><br/>Squad 4<br/><br/>Monitorea contenedores,<br/>detecta alertas y planifica<br/>la recolección"]

    subgraph plataforma["Plataforma CityPass+"]
        bus["<b>Bus de eventos</b><br/>Squad 1"]
        identidad["<b>Login federado</b><br/>Squad 2<br/>LDAP + JWT"]
        emergencias["<b>Emergencias</b><br/>Squad 6"]
        reclamos["<b>Reclamos</b><br/>Squad 5"]
        movilidad["<b>Movilidad</b><br/>Squad 3"]
        analitica["<b>Analítica</b><br/>Squad 8"]
    end

    sensores["Sensores IoT<br/>en los contenedores"]

    operador --> residuos
    vecino --> residuos
    chofer2 --> residuos
    sensores -->|"lecturas cada 15 min<br/>X-Sensor-Key"| residuos

    identidad -->|"emite el JWT que<br/>protege los endpoints"| residuos
    residuos -->|"publica eventos<br/>de su dominio"| bus
    bus -->|"incendios"| emergencias
    bus -->|"métricas"| analitica
    reclamos -->|"reclamos de residuos"| bus
    movilidad -->|"calles cortadas"| bus
    emergencias -->|"incidentes que<br/>bloquean zonas"| bus
    bus -->|"eventos de otros<br/>módulos"| residuos

    style residuos fill:#1f6f54,stroke:#0d3b2e,color:#ffffff
```

> **Las flechas hacia el bus son punteadas en el tiempo, no en el espacio.** Nada de lo que
> publicamos espera respuesta: el módulo sigue funcionando aunque Emergencias esté caído. Eso es
> justamente lo que compra el asincronismo, y es lo que el diagrama sincrónico equivalente no
> podría mostrar sin cadenas de dependencia entre todos los squads.

---

## 3. Contenedores — C4 nivel 2

Las piezas internas y cómo se comunican.

```mermaid
flowchart TB
    subgraph clientes["Clientes"]
        spa["<b>SPA</b><br/>React + Vite + Leaflet<br/><i>Operador, chofer y vecino</i>"]
        simulador["<b>Simulador de sensores</b><br/>Node<br/><i>Sustituye al hardware</i>"]
    end

    subgraph modulo["Módulo de Residuos"]
        api["<b>API REST</b><br/>NestJS + TypeScript<br/><i>Casos de uso, reglas<br/>y autorización</i>"]
        despachador["<b>Despachador de outbox</b><br/><i>Publica los eventos<br/>pendientes con reintentos</i>"]
        db[("<b>PostgreSQL</b><br/>Dominio + tabla outbox")]
    end

    bus["<b>Bus de eventos</b><br/>Squad 1"]
    idp["<b>Emisor de identidad</b><br/>Squad 2"]

    spa -->|"REST + JSON<br/>Bearer JWT"| api
    simulador -->|"POST /lecturas<br/>X-Sensor-Key"| api
    api -->|"SQL"| db
    api -.->|"verifica la firma<br/>del token"| idp
    despachador -->|"lee pendientes<br/>marca publicados"| db
    despachador -->|"publica"| bus
    bus -.->|"suscripciones"| api

    style api fill:#1f6f54,stroke:#0d3b2e,color:#ffffff
    style despachador fill:#2f7d63,stroke:#0d3b2e,color:#ffffff
```

**Por qué el despachador es una pieza aparte y no una función más de la API:** porque publicar y
atender requests son dos ritmos distintos. La API responde en milisegundos; el despachador
reintenta con backoff durante minutos si el bus está caído. Mezclarlos haría que una falla del
broker se sintiera como lentitud de la API.

---

## 4. Arquitectura de eventos

En el vocabulario de la Unidad 03: **productor**, **canal / tópico**, **consumidor**.

```mermaid
flowchart LR
    subgraph productor["Productor · Módulo de Residuos"]
        reglas["Motor de reglas<br/>CU-05 · CU-06"]
        rutas["Rutas<br/>CU-08 · CU-09 · CU-10"]
        outbox[("<b>Tabla outbox</b><br/>evento_pendiente")]
        desp["Despachador"]
    end

    subgraph canales["Canales / Tópicos"]
        t1["residuos.contenedor.critico"]
        t2["residuos.incendio.detectado"]
        t3["residuos.contenedor.vaciado"]
        t4["residuos.ruta.generada"]
        t5["residuos.ruta.asignada"]
    end

    subgraph consumidores["Consumidores"]
        c1["Emergencias<br/>Squad 6"]
        c2["Analítica<br/>Squad 8"]
        c3["Reclamos<br/>Squad 5"]
    end

    dlq["<b>Dead letter</b><br/>estado FALLIDO<br/><i>queda para inspección</i>"]

    reglas -->|"escribe en la misma<br/>transacción"| outbox
    rutas -->|"escribe en la misma<br/>transacción"| outbox
    outbox --> desp
    desp -->|"reintenta con<br/>backoff exponencial"| t1
    desp --> t2
    desp --> t3
    desp --> t4
    desp --> t5
    desp -.->|"agotados los<br/>reintentos"| dlq

    t1 --> c2
    t1 --> c3
    t2 --> c1
    t3 --> c2
    t4 --> c2
    t5 --> c2

    style outbox fill:#1f6f54,stroke:#0d3b2e,color:#ffffff
    style dlq fill:#7a2e2e,stroke:#3d1717,color:#ffffff
```

### Por qué la tabla outbox está en el medio

La Unidad 03 nombra entre los beneficios de la comunicación asincrónica los de **reprocesar**
—"dotar de un mecanismo para que se procesen los mensajes enviados"— y **fallas** —"puedo
almacenar los mensajes que fueron fallidos para hacer algo"—. La tabla outbox es exactamente eso,
implementado.

El evento se escribe en la base **dentro de la misma transacción** que el cambio de negocio que lo
origina. Eso da dos garantías que publicar directo contra el broker no puede dar:

- **Si el broker está caído, el evento no se pierde.** Queda pendiente y se reintenta.
- **Si la transacción de negocio falla, el evento no se publica.** No existe el caso de un
  contenedor que "se marcó crítico" según el bus pero no según la base.

Y lo que el módulo publica **no espera respuesta de nadie**: es lo que evita los seis problemas que
la unidad enumera para lo sincrónico —bloqueo, latencia, dependencia, acoplamiento, complejidad y
volumen—. Emergencias puede estar caído y nuestra ingesta sigue andando.

### Eventos a los que nos suscribimos

| Canal | Squad | Qué hacemos al recibirlo |
|---|---|---|
| `emergencias.incidente.creado` | 6 | Bloqueamos la zona: sus contenedores quedan fuera del ruteo |
| `movilidad.calle.cortada` | 3 | Se excluye el tramo del cálculo de ruta |
| `reclamos.creado` | 5 | Si es de residuos, sube la prioridad del contenedor |

> Los nombres de estos tres son **supuestos**, derivados de la descripción de cada módulo en el
> enunciado. Hay que confirmarlos con cada squad. Ver
> [contratos-de-eventos.md](contratos-de-eventos.md).

---

## 5. Secuencia — ingesta y detección (CU-04, CU-05, CU-06)

El camino crítico del módulo: una lectura entra y todo lo demás ocurre como consecuencia.

```mermaid
sequenceDiagram
    autonumber
    participant S as Sensor IoT
    participant G as SensorKeyGuard
    participant L as LecturasService
    participant R as Motor de reglas<br/>(funciones puras)
    participant A as AlertasService
    participant DB as PostgreSQL
    participant O as Tabla outbox
    participant D as Despachador
    participant B as Bus de eventos

    S->>G: POST /lecturas<br/>X-Sensor-Key
    G->>DB: buscar sensor por hash de la key
    alt key inválida
        G-->>S: 401 SENSOR_KEY_INVALIDA
    end
    G->>L: sensor autenticado

    rect rgb(232, 244, 239)
        Note over L,O: Una sola transacción
        L->>DB: ¿hay lectura posterior?
        alt llega fuera de orden
            L-->>S: 409 LECTURA_FUERA_DE_ORDEN
        end
        L->>DB: guardar lectura (append-only)
        L->>DB: actualizar sensor (batería)
        L->>DB: leer umbrales de la zona
        L->>R: evaluar estado y temperatura

        alt temperatura sobre el umbral
            R-->>L: riesgo de incendio
            L->>A: registrar incendio
            A->>DB: crear alerta CRITICA
            A->>O: encolar residuos.incendio.detectado
        end

        alt transición NORMAL/ADVERTENCIA a CRITICO
            R-->>L: cruzó el umbral
            L->>A: registrar saturación
            A->>DB: crear alerta
            A->>O: encolar residuos.contenedor.critico
        else ya estaba CRITICO
            R-->>L: sin transición
            Note over L,A: No se re-emite:<br/>si no, una alerta cada 15 min
        end

        L->>DB: actualizar estado del contenedor
    end

    L-->>S: 202 con la transición

    Note over D,B: Fuera de la transacción, en intervalo
    D->>O: tomar pendientes vencidos
    D->>B: publicar
    alt el bus responde
        D->>O: marcar PUBLICADO
    else el bus falla
        D->>O: backoff exponencial
        Note over D,O: Agotados los reintentos<br/>pasa a FALLIDO
    end
```

**Lo que este diagrama explica mejor que cualquier texto:** por qué la publicación está *fuera* del
recuadro de la transacción. Si estuviera adentro, una caída del bus revertiría la lectura y el
contenedor no quedaría marcado crítico. La transacción de negocio no puede depender de que un
tercero esté vivo.

---

## 6. Secuencia — ciclo de recolección (CU-08, CU-09, CU-10)

De contenedor saturado a contenedor vaciado. Es la historia que cuenta la demo.

```mermaid
sequenceDiagram
    autonumber
    actor OP as Operador
    participant API as API
    participant P as Planificador<br/>(heurística pura)
    participant DB as PostgreSQL
    actor CH as Chofer
    participant O as Outbox

    Note over OP,DB: CU-08 · Generar la propuesta
    OP->>API: POST /rutas/generar {camionId}
    API->>DB: ¿el camión está DISPONIBLE?
    API->>DB: contenedores CRITICOS del tipo habilitado
    Note over API,DB: descarta los ya ruteados<br/>y las zonas bloqueadas
    API->>P: planificar con la capacidad del camión
    P-->>API: paradas ordenadas + distancia + litros
    API->>DB: crear ruta PROPUESTA + paradas
    API->>O: encolar residuos.ruta.generada
    API-->>OP: 201 ruta PROPUESTA
    Note over OP,DB: El camión sigue DISPONIBLE:<br/>es una propuesta, no un compromiso

    Note over OP,DB: CU-09 · Una persona confirma
    OP->>API: PATCH /rutas/:id/asignar {choferId}
    API->>DB: ruta a ASIGNADA
    API->>DB: camión a EN_RUTA
    API->>O: encolar residuos.ruta.asignada
    API-->>OP: 200 ruta ASIGNADA

    Note over CH,O: CU-10 · El chofer ejecuta
    CH->>API: GET /rutas/mias
    Note over CH,API: La identidad sale del JWT.<br/>Por query string, cualquiera<br/>leería la ruta de otro
    API-->>CH: ruta con sus paradas en orden

    loop por cada parada
        CH->>API: PATCH /paradas/:id/confirmar {lat, lng}
        API->>DB: ¿la parada es de su ruta?
        API->>API: distancia al contenedor
        alt a más de 100 m
            API-->>CH: 403 PARADA_FUERA_DE_RADIO<br/>"estás a N metros"
        end
        rect rgb(232, 244, 239)
            Note over API,O: Una sola transacción
            API->>DB: parada CONFIRMADA
            API->>DB: contenedor a NORMAL, 0%
            API->>DB: cerrar alertas de saturación
            API->>DB: avanzar la ruta
            API->>O: encolar residuos.contenedor.vaciado
        end
        API-->>CH: 200 con la transición completa
    end

    Note over API,DB: La última confirmación cierra la ruta<br/>y libera el camión a DISPONIBLE
```

**Por qué generar y asignar están separados:** la heurística propone y una persona confirma. Es el
único momento en que alguien puede notar que la propuesta es absurda, y por eso el recorrido, el
orden y la carga se ven *antes* del botón.

---

## 7. Máquinas de estado

### Contenedor

```mermaid
stateDiagram-v2
    [*] --> NORMAL: alta (CU-01)

    NORMAL --> ADVERTENCIA: lectura cerca del umbral
    ADVERTENCIA --> NORMAL: baja el nivel
    ADVERTENCIA --> CRITICO: cruza el umbral de la zona
    NORMAL --> CRITICO: cruza el umbral de la zona
    CRITICO --> NORMAL: vaciado confirmado (CU-10)

    NORMAL --> FUERA_DE_SERVICIO: decisión del administrador
    ADVERTENCIA --> FUERA_DE_SERVICIO: decisión del administrador
    CRITICO --> FUERA_DE_SERVICIO: decisión del administrador

    note right of CRITICO
        La alerta se emite solo en
        la transición a CRITICO.
        Estando ya acá, una lectura
        más alta no genera nada.
    end note

    note right of FUERA_DE_SERVICIO
        Ninguna lectura lo saca
        de este estado.
    end note
```

### Alerta

```mermaid
stateDiagram-v2
    [*] --> ABIERTA: la detecta el motor de reglas
    ABIERTA --> EN_ATENCION: el operador la toma
    ABIERTA --> RESUELTA: vaciado confirmado (CU-10)
    EN_ATENCION --> RESUELTA: el operador la cierra
    RESUELTA --> [*]

    note right of ABIERTA
        No se puede saltear ni
        volver atrás: los botones
        se deshabilitan según
        el estado.
    end note
```

### Ruta

```mermaid
stateDiagram-v2
    [*] --> PROPUESTA: CU-08 genera
    PROPUESTA --> ASIGNADA: CU-09 confirma<br/>(el camión pasa a EN_RUTA)
    ASIGNADA --> EN_CURSO: primera parada confirmada
    EN_CURSO --> COMPLETADA: última parada confirmada<br/>(el camión vuelve a DISPONIBLE)
    PROPUESTA --> CANCELADA
    ASIGNADA --> CANCELADA
    COMPLETADA --> [*]
    CANCELADA --> [*]

    note right of COMPLETADA
        Cerrar la ruta es lo único
        que libera el camión: CU-03
        no permite sacarlo de
        EN_RUTA a mano.
    end note
```

---

## Documentos relacionados

| Documento | Qué tiene |
|---|---|
| [modelo-de-datos.md](modelo-de-datos.md) | Diagrama entidad-relación y decisiones de modelado |
| [contratos-de-eventos.md](contratos-de-eventos.md) | Sobre común, payloads y política de reintentos |
| [guia-frontend.md](guia-frontend.md) | Contratos de cada endpoint con capturas reales |
| [../adr/](../adr/) | Las decisiones de arquitectura, con las opciones descartadas |
