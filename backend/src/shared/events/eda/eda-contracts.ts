import { DomainEvent, EventTypes } from '../../domain/domain-event';

type AvroField = { name: string; type: unknown; default?: unknown };
const strings = (...names: string[]): AvroField[] =>
  names.map((name) => ({ name, type: 'string' }));
const numbers = (...names: string[]): AvroField[] =>
  names.map((name) => ({ name, type: 'double' }));
const location: AvroField = {
  name: 'ubicacion',
  type: { type: 'record', name: 'Ubicacion', fields: numbers('lat', 'lng') },
};
const climate: AvroField[] = [
  ...strings('inundacionId', 'estado'),
  { name: 'zonaIds', type: { type: 'array', items: 'string' } },
  { name: 'alertaId', type: ['null', 'string'], default: null },
  { name: 'actorSub', type: ['null', 'string'], default: null },
];

/** Cada nombre pertenece al namespace de Residuos; nunca publica en el de Espacios. */
export const CONTRATOS_EDA: Record<string, { name: string; fields: AvroField[] }> = {
  [EventTypes.SERVICIO_AFECTADO]: { name: 'ServicioAfectado', fields: climate },
  [EventTypes.RECUPERACION_PENDIENTE]: { name: 'RecuperacionPendiente', fields: climate },
  [EventTypes.RECUPERACION_HABILITADA]: { name: 'RecuperacionHabilitada', fields: climate },
  [EventTypes.SERVICIO_RESTABLECIDO]: { name: 'ServicioRestablecido', fields: climate },
  [EventTypes.CONTENEDOR_CRITICO]: {
    name: 'ContenedorCritico',
    fields: [
      ...strings('contenedorId', 'zonaId', 'tipoResiduo', 'detectadoEn'),
      ...numbers('nivelLlenado', 'umbralConfigurado'),
      location,
    ],
  },
  [EventTypes.INCENDIO_DETECTADO]: {
    name: 'IncendioDetectado',
    fields: [
      ...strings('contenedorId', 'zonaId', 'severidad', 'detectadoEn'),
      ...numbers('temperaturaCelsius', 'umbralConfigurado'),
      location,
    ],
  },
  [EventTypes.CONTENEDOR_VACIADO]: {
    name: 'ContenedorVaciado',
    fields: [
      ...strings('contenedorId', 'rutaId', 'camionId', 'choferId', 'confirmadoEn'),
      ...numbers('nivelPrevio'),
    ],
  },
  [EventTypes.PARADA_OMITIDA]: {
    name: 'ParadaOmitida',
    fields: [
      ...strings(
        'paradaId',
        'rutaId',
        'contenedorId',
        'camionId',
        'choferId',
        'motivo',
        'omitidaEn',
      ),
      ...numbers('nivelLlenadoPct'),
    ],
  },
  [EventTypes.RUTA_GENERADA]: {
    name: 'RutaGenerada',
    fields: [
      ...strings('rutaId', 'camionId', 'generadaEn'),
      ...numbers('cantidadParadas', 'distanciaEstimadaKm', 'cargaEstimadaLitros'),
    ],
  },
  [EventTypes.RUTA_ASIGNADA]: {
    name: 'RutaAsignada',
    fields: [
      ...strings('rutaId', 'camionId', 'choferId', 'choferNombre', 'asignadaEn'),
      ...numbers('cantidadParadas'),
    ],
  },
};
export function registroEda(contract: { name: string; fields: AvroField[] }) {
  return {
    name: contract.name,
    fields: [
      ...strings('eventId', 'occurredAt'),
      { name: 'correlationId', type: ['null', 'string'], default: null },
      ...contract.fields,
    ],
  };
}
export function publicacionEda(event: DomainEvent, namespace: string) {
  const contract = CONTRATOS_EDA[event.eventType];
  if (!contract) throw new Error(`Sin contrato EDA para ${event.eventType}`);
  return {
    fqn: `${namespace}.${contract.name}`,
    data: {
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      correlationId: event.correlationId ?? null,
      ...Object.fromEntries(
        contract.fields.map((f) => [f.name, event.payload[f.name] ?? f.default]),
      ),
    },
  };
}
