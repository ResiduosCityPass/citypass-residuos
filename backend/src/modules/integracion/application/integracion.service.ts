import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes, buildEvent } from '../../../shared/domain/domain-event';
import { distanciaMetros } from '../../../shared/domain/geo';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { CausaAfectacion, ParadasService } from '../../rutas/application/paradas.service';
import { ZonasService } from '../../zonas/application/zonas.service';
import { INTEGRACION_REPOSITORY, IntegracionRepository } from '../domain/integracion.repository';
import { ActividadesMasivasService } from './actividades-masivas.service';
import { ReclamosService } from './reclamos.service';

/** Sobre con el que el gateway del Squad 1 entrega cada evento por webhook. */
export interface SobreGateway {
  metadata?: { eventId?: string; eventType?: string };
  data?: Record<string, unknown>;
}

export type ResultadoProcesamiento = 'procesado' | 'duplicado' | 'ignorado';

const ESPACIOS = 'com.citypass.espacios.';
const EMERGENCIAS = 'com.citypass.emergencias.';

/** Estados en los que una emergencia deja de cortar la circulacion. */
const EMERGENCIA_TERMINADA = new Set(['RESUELTA', 'CERRADA', 'DESCARTADA', 'CANCELADA']);

/**
 * Reacciones a eventos de otros modulos de CityPass+ (CU-INT-01).
 *
 *   EventoComunitarioPublicado -> refuerzo de recoleccion cerca del espacio
 *   EventoCancelado            -> se cancela el refuerzo
 *   EmergenciaCreada           -> se bloquean para el ruteo las zonas afectadas y
 *                                 se sacan los contenedores cercanos de las rutas vivas
 *   EmergenciaActualizada      -> al terminar la emergencia se desbloquean
 *   ActividadCreada            -> zona del evento y escuadrilla (squad 3, ActividadesMasivasService)
 *   Reclamos (CU-INT-02)       -> ver ReclamosService
 *
 * Todo corre en una transaccion: si algo falla tampoco queda registrado el
 * eventId, el webhook responde error y el dispatcher del Squad 1 reintenta.
 */
@Injectable()
export class IntegracionService {
  private readonly logger = new Logger(IntegracionService.name);

  private readonly radioMetros: number;
  private readonly cupoMinimoRefuerzo: number;
  private readonly ventanaRefuerzoHoras: number;

  constructor(
    @Inject(INTEGRACION_REPOSITORY)
    private readonly integracion: IntegracionRepository,
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventos: EventPublisher,
    private readonly zonas: ZonasService,
    private readonly transaccion: ContextoTransaccional,
    config: ConfigService,
    private readonly actividades: ActividadesMasivasService,
    // Opcional para que los tests de CU-INT-01 no tengan que armarlo.
    @Optional()
    private readonly reclamos?: ReclamosService,
    // forwardRef: rutas ya depende de integracion por los refuerzos y las obstrucciones.
    @Optional()
    @Inject(forwardRef(() => ParadasService))
    private readonly paradas?: Pick<ParadasService, 'quitarContenedores'>,
  ) {
    this.radioMetros = Number(config.get('INTEGRACION_RADIO_METROS', 300));
    this.cupoMinimoRefuerzo = Number(config.get('INTEGRACION_CUPO_MINIMO_REFUERZO', 100));
    this.ventanaRefuerzoHoras = Number(config.get('INTEGRACION_VENTANA_REFUERZO_HORAS', 12));
  }

  async procesar(sobre: SobreGateway): Promise<ResultadoProcesamiento> {
    const eventId = sobre?.metadata?.eventId;
    const eventType = sobre?.metadata?.eventType;
    const data = sobre?.data;

    if (!eventId || !eventType || !data || typeof data !== 'object') {
      throw new BadRequestException({
        message: 'El evento no trae metadata.eventId, metadata.eventType o data',
        code: 'EVENTO_MAL_FORMADO',
      });
    }

    return this.transaccion.ejecutar(async () => {
      if (!(await this.integracion.registrarEvento(eventId, eventType))) {
        return 'duplicado';
      }

      switch (eventType) {
        case `${ESPACIOS}EventoComunitarioPublicado`:
          await this.programarRefuerzo(data);
          return 'procesado';
        case `${ESPACIOS}EventoCancelado`:
          await this.integracion.borrarRefuerzo(texto(data, 'eventoId'));
          return 'procesado';
        case `${EMERGENCIAS}EmergenciaCreada`:
          await this.bloquearZonas(data);
          return 'procesado';
        case `${EMERGENCIAS}EmergenciaActualizada`:
          await this.desbloquearSiTermino(data);
          return 'procesado';
        case `${ESPACIOS}ActividadCreada`:
          await this.actividades.registrar(data);
          return 'procesado';
        default:
          if (await this.reclamos?.procesar(eventType, data)) {
            return 'procesado';
          }
          this.logger.log(`Tipo de evento sin manejo en Residuos: ${eventType}`);
          return 'ignorado';
      }
    });
  }

  /** Refuerzo de recoleccion para despues de un evento masivo. */
  private async programarRefuerzo(data: Record<string, unknown>): Promise<void> {
    const punto = coordenadas(data);
    const cupo = Number(data.cupoMaximo ?? 0);

    if (!punto || cupo < this.cupoMinimoRefuerzo) {
      return;
    }

    const cercanos = await this.contenedoresCerca(punto);
    if (cercanos.length === 0) {
      return;
    }

    const eventoId = texto(data, 'eventoId');
    const desde = new Date(texto(data, 'fin'));
    const hasta = new Date(desde.getTime() + this.ventanaRefuerzoHoras * 3_600_000);
    const zona = typeof data.zona === 'string' ? data.zona : null;

    await this.integracion.guardarRefuerzo({
      eventoId,
      zona,
      contenedorIds: cercanos.map((c) => c.id),
      desde,
      hasta,
    });

    await this.eventos.publish(
      buildEvent(EventTypes.REFUERZO_PROGRAMADO, {
        refuerzoId: `refuerzo-${eventoId}`,
        eventoId,
        zona: zona ?? '',
        contenedores: cercanos.length,
        programadoPara: desde.toISOString(),
      }),
    );
  }

  /**
   * Bloquea para el ruteo las zonas de los contenedores cercanos a la emergencia
   * y saca esos contenedores de las rutas vivas: el bloqueo solo frena las rutas
   * que se generen despues, y la cuadrilla afectada es la que ya esta en la calle.
   * De las rutas salen solo los cercanos y no toda la zona: una parada a varias
   * cuadras del corte se puede seguir haciendo.
   */
  private async bloquearZonas(data: Record<string, unknown>): Promise<void> {
    const punto = coordenadas(data);

    // Las emergencias que no cortan la circulacion (medica, panico) llegan sin coordenadas.
    if (data.afectaCirculacion !== true || !punto) {
      return;
    }

    // Se anotan todas las zonas afectadas, esten o no bloqueadas ya: dos
    // emergencias en la misma zona la comparten, y el bloqueo de un operador
    // se guarda aparte en la zona (`bloqueoManual`), asi que no se pierde.
    const cercanos = await this.contenedoresCerca(punto);
    const afectadas = [...new Set(cercanos.map((c) => c.zonaId))];
    if (afectadas.length === 0) {
      return;
    }

    for (const zonaId of afectadas) {
      await this.zonas.cambiarBloqueoPorIncidente(zonaId, true);
    }

    const emergenciaId = texto(data, 'emergenciaId');

    await this.integracion.guardarBloqueo({
      emergenciaId,
      zonaIds: afectadas,
      activo: true,
    });

    await this.paradas?.quitarContenedores(
      cercanos.map((c) => c.id),
      `Zona bloqueada por la emergencia ${emergenciaId}`,
      undefined,
      causaDeLaEmergencia(data, emergenciaId),
    );
  }

  private async desbloquearSiTermino(data: Record<string, unknown>): Promise<void> {
    if (!EMERGENCIA_TERMINADA.has(String(data.estadoNuevo))) {
      return;
    }

    const bloqueo = await this.integracion.buscarBloqueo(texto(data, 'emergenciaId'));
    if (!bloqueo || !bloqueo.activo) {
      return;
    }

    bloqueo.activo = false;
    await this.integracion.guardarBloqueo(bloqueo);

    // Una zona puede seguir bloqueada por otra emergencia activa en la misma
    // zona. Si un operador la bloqueo a mano, ZonasService la deja bloqueada.
    const siguenBloqueadas = new Set(
      (await this.integracion.bloqueosActivos()).flatMap((b) => b.zonaIds),
    );

    for (const zonaId of bloqueo.zonaIds) {
      if (!siguenBloqueadas.has(zonaId)) {
        await this.zonas.cambiarBloqueoPorIncidente(zonaId, false);
      }
    }
  }

  private async contenedoresCerca(punto: { lat: number; lng: number }) {
    const activos = await this.contenedores.listar({ soloActivos: true });
    return activos.filter((c) => distanciaMetros(punto, c) <= this.radioMetros);
  }
}

function texto(data: Record<string, unknown>, campo: string): string {
  const valor = data[campo];
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new BadRequestException({
      message: `Falta el campo obligatorio '${campo}'`,
      code: 'EVENTO_MAL_FORMADO',
    });
  }
  return valor;
}

/**
 * El contrato pide los dos campos juntos: `causaTipo` es null si y solo si
 * `causaId` es null. Analitica no infiere causas, asi que una emergencia sin
 * causa corta el camino igual, pero no suma a ninguna metrica por causa.
 */
function causaDeLaEmergencia(data: Record<string, unknown>, emergenciaId: string): CausaAfectacion {
  const { causaId, causaTipo, correlationId } = data;
  const completa = typeof causaId === 'string' && typeof causaTipo === 'string';

  return {
    causaId: completa ? causaId : null,
    causaTipo: completa ? causaTipo : null,
    correlationId: typeof correlationId === 'string' ? correlationId : emergenciaId,
  };
}

function coordenadas(data: Record<string, unknown>): { lat: number; lng: number } | null {
  return typeof data.latitud === 'number' && typeof data.longitud === 'number'
    ? { lat: data.latitud, lng: data.longitud }
    : null;
}
