import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CRITICIDAD_CONFIRMADA, CRITICIDAD_FINALIZADA } from './dto/criticidad-climatica.dto';

export const PREFIJO_SIMULACRO = 'SIMULACRO-RES-';
export const ACTOR_SIMULACRO = 'simulacro-residuos';
export const SIMULACRO_CONFIRMADO = 'com.citypass.residuos.SimulacroClimaticoConfirmado';
export const SIMULACRO_FINALIZADO = 'com.citypass.residuos.SimulacroClimaticoFinalizado';

/** Tipos propios y separados de los de Espacios; el payload conserva su contrato. */
export const SIMULACROS_EDA = [
  {
    fqn: SIMULACRO_CONFIRMADO,
    tipo: CRITICIDAD_CONFIRMADA,
    name: 'SimulacroClimaticoConfirmado',
    fields: [
      { name: 'alertaId', type: 'string' },
      {
        name: 'nivelCriticidad',
        type: {
          type: 'enum',
          name: 'CriticidadSimulacro',
          symbols: ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'],
        },
      },
      {
        name: 'fenomeno',
        type: {
          type: 'enum',
          name: 'FenomenoSimulacro',
          symbols: [
            'TORMENTA_FUERTE',
            'LLUVIA_INTENSA',
            'VIENTO_FUERTE',
            'OLA_DE_CALOR',
            'OLA_DE_FRIO',
            'GRANIZO',
            'TORMENTA_ELECTRICA',
            'HURACAN',
            'NIEVE',
          ],
        },
      },
      {
        name: 'ubicaciones',
        type: {
          type: 'array',
          items: {
            type: 'record',
            name: 'UbicacionSimulacro',
            fields: [
              { name: 'latitud', type: 'double' },
              { name: 'longitud', type: 'double' },
            ],
          },
        },
      },
      { name: 'barrios', type: { type: 'array', items: 'string' }, default: [] },
      { name: 'vigenciaDesde', type: 'long' },
      { name: 'vigenciaHasta', type: 'long' },
      { name: 'temperaturaMinC', type: ['null', 'double'], default: null },
      { name: 'temperaturaMaxC', type: ['null', 'double'], default: null },
      { name: 'actorSub', type: 'string' },
    ],
  },
  {
    fqn: SIMULACRO_FINALIZADO,
    tipo: CRITICIDAD_FINALIZADA,
    name: 'SimulacroClimaticoFinalizado',
    fields: [
      { name: 'alertaId', type: 'string' },
      { name: 'finalizadaEn', type: 'long' },
      { name: 'actorSub', type: 'string' },
    ],
  },
];

export function simulacroEdaHabilitado(config: ConfigService): boolean {
  return (
    ['development', 'test'].includes(config.get<string>('NODE_ENV', 'development')) &&
    config.get<string>('EDA_CLIMA_SIMULACRO_ENABLED', 'false') === 'true'
  );
}

export function esTopicDe(topic: string, fqn: string): boolean {
  return topic === fqn || (topic.startsWith(fqn) && /^\.v\d+$/.test(topic.slice(fqn.length)));
}

export function crearInicioSimulacro(now = Date.now()) {
  return {
    alertaId: `${PREFIJO_SIMULACRO}${randomUUID()}`,
    nivelCriticidad: 'ALTA',
    fenomeno: 'LLUVIA_INTENSA',
    ubicaciones: [{ latitud: -34.603666, longitud: -58.380515 }],
    barrios: ['SAN NICOLAS'],
    vigenciaDesde: now - 1000,
    vigenciaHasta: now + 60 * 60 * 1000,
    temperaturaMinC: null,
    temperaturaMaxC: null,
    actorSub: ACTOR_SIMULACRO,
  };
}

export function crearFinSimulacro(alertaId: string, now = Date.now()) {
  if (!alertaId.startsWith(PREFIJO_SIMULACRO) || alertaId.length > 200)
    throw new Error(`El alertaId de prueba debe comenzar con ${PREFIJO_SIMULACRO}`);
  return { alertaId, finalizadaEn: now, actorSub: ACTOR_SIMULACRO };
}
