/**
 * Datos de demostracion para disenar las pantallas sin backend.
 *
 * No son datos bonitos: son los casos que la UI tiene que saber mostrar. Un
 * fixture donde todos los contenedores reportan bien y todas las alertas estan
 * abiertas produce pantallas que se caen el primer dia contra datos reales.
 *
 * Estan cubiertos, a proposito:
 *   - un contenedor CRITICO muy por encima del umbral
 *   - uno en ADVERTENCIA, a menos de 10 puntos del umbral de su zona
 *   - uno FUERA_DE_SERVICIO, al que las lecturas no sacan de ese estado
 *   - uno SIN SENSOR, que no es lo mismo que uno vacio: nunca va a cambiar
 *   - uno VERDE con un INCENDIO abierto, porque el fuego no depende del llenado
 *   - uno con la bateria del sensor al 12%
 *   - una zona bloqueada y una zona sin contenedores (que si se puede borrar)
 *   - alertas en los tres estados de la maquina ABIERTA / EN_ATENCION / RESUELTA
 *
 * ANDAMIAJE TEMPORAL: se borra cuando las pantallas se conecten al backend.
 */

const now = Date.now();
const minutesAgo = (m) => new Date(now - m * 60_000).toISOString();
const hoursAgo = (h) => minutesAgo(h * 60);

export const ZONES = [
  {
    id: 'zn-centro',
    nombre: 'Centro',
    umbralCriticoPct: 70,
    umbralTemperaturaC: 60,
    bloqueada: false,
    creadaEn: hoursAgo(72),
    actualizadaEn: hoursAgo(72),
  },
  {
    id: 'zn-palermo',
    nombre: 'Palermo',
    umbralCriticoPct: 80,
    umbralTemperaturaC: 60,
    bloqueada: false,
    creadaEn: hoursAgo(72),
    actualizadaEn: hoursAgo(30),
  },
  {
    // Bloqueada: queda excluida del ruteo. Desde el Sprint 4 esto lo dispara
    // solo un incidente del modulo de Emergencias; por ahora es manual.
    id: 'zn-chacarita',
    nombre: 'Chacarita',
    umbralCriticoPct: 85,
    umbralTemperaturaC: 70,
    bloqueada: true,
    creadaEn: hoursAgo(72),
    actualizadaEn: hoursAgo(4),
  },
  {
    // Sin contenedores: es la unica que se puede borrar sin comerse un 409.
    id: 'zn-villa-crespo',
    nombre: 'Villa Crespo',
    umbralCriticoPct: 75,
    umbralTemperaturaC: 60,
    bloqueada: false,
    creadaEn: hoursAgo(20),
    actualizadaEn: hoursAgo(20),
  },
];

/** Todo gira alrededor del Obelisco, igual que el seed del simulador. */
const container = (id, codigo, zonaId, extras) => ({
  id,
  codigo,
  zonaId,
  tipoResiduo: 'COMUN',
  capacidadLitros: 1100,
  estado: 'NORMAL',
  nivelLlenadoPct: 0,
  temperaturaC: 21.4,
  ultimaLecturaEn: minutesAgo(3),
  activo: true,
  creadoEn: hoursAgo(72),
  actualizadoEn: minutesAgo(3),
  ...extras,
});

export const CONTAINERS = [
  container('ct-01', 'CT-0001', 'zn-centro', {
    lat: -34.6045, lng: -58.3801, estado: 'CRITICO', nivelLlenadoPct: 94.14, temperaturaC: 20.61,
  }),
  container('ct-02', 'CT-0002', 'zn-centro', {
    // 66% sobre un umbral de 70: a menos de 10 puntos, por eso ADVERTENCIA.
    lat: -34.6021, lng: -58.3833, estado: 'ADVERTENCIA', nivelLlenadoPct: 66.5, tipoResiduo: 'RECICLABLE',
  }),
  container('ct-03', 'CT-0003', 'zn-centro', {
    // Verde al 8% y prendido fuego. El estado refleja el llenado, no la
    // temperatura: 91 C sobre un umbral de 60 y el marcador sigue verde.
    lat: -34.6068, lng: -58.3789, estado: 'NORMAL', nivelLlenadoPct: 8.2, temperaturaC: 91.4,
    tipoResiduo: 'ORGANICO',
  }),
  container('ct-04', 'CT-0004', 'zn-centro', {
    lat: -34.6012, lng: -58.3772, estado: 'NORMAL', nivelLlenadoPct: 34.8,
  }),
  container('ct-05', 'CT-0005', 'zn-centro', {
    // Roto. Ninguna lectura lo saca de aca: solo un administrador lo reactiva.
    lat: -34.6083, lng: -58.3845, estado: 'FUERA_DE_SERVICIO', nivelLlenadoPct: 52.0,
    ultimaLecturaEn: hoursAgo(38), capacidadLitros: 2400,
  }),
  container('ct-06', 'CT-0006', 'zn-centro', {
    // Recien dado de alta y todavia sin sensor vinculado. No es un contenedor
    // vacio: es uno que no reporta, y se queda asi para siempre.
    lat: -34.5998, lng: -58.3818, estado: 'NORMAL', nivelLlenadoPct: 0,
    temperaturaC: null, ultimaLecturaEn: null, creadoEn: hoursAgo(2), actualizadoEn: hoursAgo(2),
    tipoResiduo: 'RECICLABLE',
  }),
  container('ct-07', 'CT-0007', 'zn-palermo', {
    lat: -34.5885, lng: -58.4108, estado: 'CRITICO', nivelLlenadoPct: 88.0, capacidadLitros: 2400,
  }),
  container('ct-08', 'CT-0008', 'zn-palermo', {
    // Bateria del sensor al 12%. Reporta, pero le quedan dias.
    lat: -34.5921, lng: -58.4055, estado: 'NORMAL', nivelLlenadoPct: 41.3, tipoResiduo: 'ORGANICO',
  }),
  container('ct-09', 'CT-0009', 'zn-palermo', {
    lat: -34.5863, lng: -58.4171, estado: 'ADVERTENCIA', nivelLlenadoPct: 73.6,
  }),
  container('ct-10', 'CT-0010', 'zn-palermo', {
    lat: -34.5949, lng: -58.4012, estado: 'NORMAL', nivelLlenadoPct: 12.7, tipoResiduo: 'RECICLABLE',
  }),
  container('ct-11', 'CT-0011', 'zn-chacarita', {
    lat: -34.5872, lng: -58.4505, estado: 'NORMAL', nivelLlenadoPct: 55.2,
  }),
  container('ct-12', 'CT-0012', 'zn-chacarita', {
    lat: -34.5901, lng: -58.4462, estado: 'CRITICO', nivelLlenadoPct: 97.8, capacidadLitros: 3200,
    tipoResiduo: 'ORGANICO',
  }),
  container('ct-13', 'CT-0013', 'zn-chacarita', {
    lat: -34.5839, lng: -58.4531, estado: 'NORMAL', nivelLlenadoPct: 22.9,
  }),
  container('ct-14', 'CT-0014', 'zn-centro', {
    lat: -34.6102, lng: -58.3760, estado: 'NORMAL', nivelLlenadoPct: 47.1, tipoResiduo: 'RECICLABLE',
  }),
];

const sensor = (id, codigo, contenedorId, extras) => ({
  id,
  codigo,
  contenedorId,
  estado: 'ACTIVO',
  bateriaPct: 96,
  ultimoReporteEn: minutesAgo(3),
  creadoEn: hoursAgo(72),
  actualizadoEn: minutesAgo(3),
  ...extras,
});

/** CT-0006 no aparece: es el que no tiene sensor. */
export const SENSORS = [
  sensor('sn-01', 'SN-0001', 'ct-01'),
  sensor('sn-02', 'SN-0002', 'ct-02', { bateriaPct: 74 }),
  sensor('sn-03', 'SN-0003', 'ct-03', { bateriaPct: 88 }),
  sensor('sn-04', 'SN-0004', 'ct-04', { bateriaPct: 61 }),
  sensor('sn-05', 'SN-0005', 'ct-05', { estado: 'SIN_SENAL', ultimoReporteEn: hoursAgo(38) }),
  sensor('sn-07', 'SN-0007', 'ct-07', { bateriaPct: 55 }),
  sensor('sn-08', 'SN-0008', 'ct-08', { estado: 'BATERIA_BAJA', bateriaPct: 12 }),
  sensor('sn-09', 'SN-0009', 'ct-09', { bateriaPct: 43 }),
  sensor('sn-10', 'SN-0010', 'ct-10', { bateriaPct: 91 }),
  sensor('sn-11', 'SN-0011', 'ct-11', { bateriaPct: 80 }),
  sensor('sn-12', 'SN-0012', 'ct-12', { bateriaPct: 37 }),
  sensor('sn-13', 'SN-0013', 'ct-13', { bateriaPct: 68 }),
  sensor('sn-14', 'SN-0014', 'ct-14', { bateriaPct: 72 }),
];

export const ALERTS = [
  {
    id: 'al-01', contenedorId: 'ct-03', tipo: 'INCENDIO', severidad: 'CRITICA', estado: 'ABIERTA',
    detalle: 'Temperatura interna 91.4C supera el umbral 60C de la zona Centro',
    detectadaEn: minutesAgo(6), resueltaEn: null, creadaEn: minutesAgo(6),
  },
  {
    id: 'al-02', contenedorId: 'ct-12', tipo: 'SATURACION', severidad: 'CRITICA', estado: 'ABIERTA',
    detalle: 'Nivel 97.8% supera el umbral 85% de la zona Chacarita',
    detectadaEn: minutesAgo(22), resueltaEn: null, creadaEn: minutesAgo(22),
  },
  {
    id: 'al-03', contenedorId: 'ct-01', tipo: 'SATURACION', severidad: 'MEDIA', estado: 'EN_ATENCION',
    // Se genero al cruzar el umbral, con 76%. El contenedor ya va por 94.14% y
    // NO se genero ninguna alerta nueva: se emite en la transicion, no en cada
    // lectura. Por eso el detalle dice 76 y la tabla del mapa dice 94.
    detalle: 'Nivel 76% supera el umbral 70% de la zona Centro',
    detectadaEn: hoursAgo(3), resueltaEn: null, creadaEn: hoursAgo(3),
  },
  {
    id: 'al-04', contenedorId: 'ct-08', tipo: 'BATERIA_BAJA', severidad: 'BAJA', estado: 'ABIERTA',
    detalle: 'El sensor SN-0008 reporto bateria al 12%',
    detectadaEn: hoursAgo(5), resueltaEn: null, creadaEn: hoursAgo(5),
  },
  {
    id: 'al-05', contenedorId: 'ct-07', tipo: 'SATURACION', severidad: 'ALTA', estado: 'ABIERTA',
    detalle: 'Nivel 88% supera el umbral 80% de la zona Palermo',
    detectadaEn: hoursAgo(1), resueltaEn: null, creadaEn: hoursAgo(1),
  },
  {
    id: 'al-06', contenedorId: 'ct-09', tipo: 'SATURACION', severidad: 'BAJA', estado: 'RESUELTA',
    detalle: 'Nivel 81% supera el umbral 80% de la zona Palermo',
    detectadaEn: hoursAgo(26), resueltaEn: hoursAgo(24), creadaEn: hoursAgo(26),
  },
  {
    id: 'al-07', contenedorId: 'ct-05', tipo: 'SENSOR_CAIDO', severidad: 'MEDIA', estado: 'RESUELTA',
    detalle: 'El sensor SN-0005 no reporta desde hace mas de 24 horas',
    detectadaEn: hoursAgo(14), resueltaEn: hoursAgo(12), creadaEn: hoursAgo(14),
  },
];

/* ------------------------------------------------------------------------
 * CU-03 · Flota
 *
 * Los tres estados posibles estan representados: solo un camion DISPONIBLE
 * puede recibir una ruta nueva, y la pantalla de generacion tiene que dejar
 * claro por que los otros dos no aparecen en el <select>.
 * ---------------------------------------------------------------------- */

export const TRUCKS = [
  {
    id: 'cm-01', patente: 'AB123CD', capacidadLitros: 12000,
    tipoResiduoHabilitado: 'COMUN', estado: 'DISPONIBLE',
    creadoEn: hoursAgo(200), actualizadoEn: hoursAgo(6),
  },
  {
    id: 'cm-02', patente: 'AC456EF', capacidadLitros: 8000,
    tipoResiduoHabilitado: 'RECICLABLE', estado: 'EN_RUTA',
    creadoEn: hoursAgo(200), actualizadoEn: minutesAgo(40),
  },
  {
    id: 'cm-03', patente: 'AD789GH', capacidadLitros: 15000,
    tipoResiduoHabilitado: 'COMUN', estado: 'MANTENIMIENTO',
    creadoEn: hoursAgo(200), actualizadoEn: hoursAgo(20),
  },
  {
    id: 'cm-04', patente: 'AE012IJ', capacidadLitros: 6000,
    tipoResiduoHabilitado: 'ORGANICO', estado: 'DISPONIBLE',
    creadoEn: hoursAgo(80), actualizadoEn: hoursAgo(80),
  },
];

/*
 * CU-09 · No hay fixture de choferes, y no puede haberlo.
 *
 * `RUTA.choferId` es un string libre: el `sub` del JWT de un usuario con rol
 * CHOFER del directorio del Squad 2 (ADR-005). No existe `GET /choferes` y el
 * backend no valida el id contra ningun padron. Mantener una lista falsa aca
 * hacia creer que el <select> se iba a poder llenar algun dia solo con conectar
 * la API; en la pantalla de asignacion el identificador se escribe a mano.
 */

/* ------------------------------------------------------------------------
 * CU-08 / CU-09 · Rutas y paradas
 * ---------------------------------------------------------------------- */

export const ROUTES = [
  {
    id: 'rt-01', camionId: 'cm-02', choferId: 'ldap:mgomez', estado: 'EN_CURSO',
    distanciaEstimadaKm: 7.4, generadaEn: minutesAgo(55), asignadaEn: minutesAgo(48),
  },
  {
    id: 'rt-02', camionId: 'cm-01', choferId: 'ldap:jperez', estado: 'COMPLETADA',
    distanciaEstimadaKm: 11.2, generadaEn: hoursAgo(28), asignadaEn: hoursAgo(27),
  },
];

export const STOPS = [
  { id: 'pd-01', rutaId: 'rt-01', contenedorId: 'ct-02', orden: 1, estado: 'CONFIRMADA', confirmadaEn: minutesAgo(20) },
  { id: 'pd-02', rutaId: 'rt-01', contenedorId: 'ct-10', orden: 2, estado: 'PENDIENTE', confirmadaEn: null },
  { id: 'pd-03', rutaId: 'rt-01', contenedorId: 'ct-14', orden: 3, estado: 'PENDIENTE', confirmadaEn: null },

  { id: 'pd-04', rutaId: 'rt-02', contenedorId: 'ct-01', orden: 1, estado: 'CONFIRMADA', confirmadaEn: hoursAgo(26) },
  { id: 'pd-05', rutaId: 'rt-02', contenedorId: 'ct-04', orden: 2, estado: 'CONFIRMADA', confirmadaEn: hoursAgo(25) },
  // Omitida: el chofer llego y no pudo vaciarlo (auto mal estacionado, calle
  // cortada). El caso existe en el enum y la UI tiene que saber mostrarlo.
  { id: 'pd-06', rutaId: 'rt-02', contenedorId: 'ct-05', orden: 3, estado: 'OMITIDA', confirmadaEn: null },
];
