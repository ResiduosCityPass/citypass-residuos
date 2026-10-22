import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes, buildEvent } from '../../../shared/domain/domain-event';
import { distanciaMetros } from '../../../shared/domain/geo';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { ZonasService } from '../../zonas/application/zonas.service';
import { INTEGRACION_REPOSITORY, IntegracionRepository } from '../domain/integracion.repository';

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
 *   EmergenciaCreada           -> se bloquean para el ruteo las zonas afectadas
 *   EmergenciaActualizada      -> al terminar la emergencia se desbloquean
 *   ActividadCreada            -> se guarda la actividad masiva con sus contenedores (squad 3)
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
  private readonly capacidadMasiva: number;
  private readonly horasZonaEvento: number;

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
  ) {
    this.radioMetros = Number(config.get('INTEGRACION_RADIO_METROS', 300));
    this.cupoMinimoRefuerzo = Number(config.get('INTEGRACION_CUPO_MINIMO_REFUERZO', 100));
    this.ventanaRefuerzoHoras = Number(config.get('INTEGRACION_VENTANA_REFUERZO_HORAS', 12));
    this.capacidadMasiva = Number(config.get('INTEGRACION_CAPACIDAD_MASIVA', 1000));
    this.horasZonaEvento = Number(config.get('INTEGRACION_HORAS_ZONA_EVENTO', 6));
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
          await this.registrarActividad(data);
          return 'procesado';
        default:
          this.logger.log(`Tipo de evento sin manejo en Residuos: ${eventType}`);
          return 'ignorado';
      }
    });
  }

  /**
   * Zonas de actividades masivas para el mapa: las que no terminaron y las que
   * terminaron hace menos de `INTEGRACION_HORAS_ZONA_EVENTO`, que es cuando la
   * escuadrilla esta limpiando.
   */
  async actividadesParaMapa(ahora = new Date()) {
    const desde = new Date(ahora.getTime() - this.horasZonaEvento * 3_600_000);
    const actividades = await this.integracion.actividadesQueTerminanDespuesDe(desde);

    return actividades.map((a) => ({
      actividadId: a.actividadId,
      titulo: a.titulo,
      capacidad: a.capacidad,
      lat: a.lat,
      lng: a.lng,
      radioMetros: this.radioMetros,
      inicio: a.inicio.toISOString(),
      fin: a.fin.toISOString(),
      contenedores: a.contenedorIds.length,
    }));
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

  /** Bloquea para el ruteo las zonas de los contenedores cercanos a la emergencia. */
  private async bloquearZonas(data: Record<string, unknown>): Promise<void> {
    const punto = coordenadas(data);

    // Las emergencias que no cortan la circulacion (medica, panico) llegan sin coordenadas.
    if (data.afectaCirculacion !== true || !punto) {
      return;
    }

    // Se anotan todas las zonas afectadas, esten o no bloqueadas ya: dos
    // emergencias en la misma zona la comparten, y el bloqueo de un operador
    // se guarda aparte en la zona (`bloqueoManual`), asi que no se pierde.
    const afectadas = [...new Set((await this.contenedoresCerca(punto)).map((c) => c.zonaId))];
    if (afectadas.length === 0) {
      return;
    }

    for (const zonaId of afectadas) {
      await this.zonas.cambiarBloqueoPorIncidente(zonaId, true);
    }

    await this.integracion.guardarBloqueo({
      emergenciaId: texto(data, 'emergenciaId'),
      zonaIds: afectadas,
      activo: true,
    });
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

  /**
   * Actividad masiva de Espacios (squad 3): se guarda con sus contenedores
   * cercanos para mandar la escuadrilla cuando termine. Usa los nombres de
   * campo de Espacios (en ingles) y su propio corte de capacidad, aparte del
   * cupo del refuerzo de CU-INT-01.
   *
   * La escuadrilla reusa el refuerzo de CU-INT-01: desde la hora de fin y
   * durante `INTEGRACION_HORAS_ZONA_EVENTO`, los contenedores de la zona entran
   * a la ruta que genera CU-08 aunque no esten criticos.
   */
  private async registrarActividad(data: Record<string, unknown>): Promise<void> {
    const punto = coordenadas(data, 'latitude', 'longitude');
    const capacidad = Number(data.capacity ?? 0);

    if (data.status === 'CANCELLED' || !punto || capacidad < this.capacidadMasiva) {
      return;
    }

    const actividadId = texto(data, 'communityEventId');
    const fin = fecha(data, 'endDate');
    const contenedorIds = (await this.contenedoresCerca(punto)).map((c) => c.id);

    await this.integracion.guardarActividad({
      actividadId,
      titulo: typeof data.title === 'string' ? data.title : null,
      capacidad,
      lat: punto.lat,
      lng: punto.lng,
      inicio: fecha(data, 'startDate'),
      fin,
      contenedorIds,
    });

    if (contenedorIds.length > 0) {
      await this.integracion.guardarRefuerzo({
        // Prefijo propio: el id de Espacios podria coincidir con el de un
        // EventoComunitarioPublicado y pisaria el refuerzo de CU-INT-01.
        eventoId: `act-${actividadId}`,
        zona: null,
        contenedorIds,
        desde: fin,
        hasta: new Date(fin.getTime() + this.horasZonaEvento * 3_600_000),
      });
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

function fecha(data: Record<string, unknown>, campo: string): Date {
  const valor = new Date(texto(data, campo));
  if (Number.isNaN(valor.getTime())) {
    throw new BadRequestException({
      message: `El campo '${campo}' no es una fecha valida`,
      code: 'EVENTO_MAL_FORMADO',
    });
  }
  return valor;
}

function coordenadas(
  data: Record<string, unknown>,
  campoLat = 'latitud',
  campoLng = 'longitud',
): { lat: number; lng: number } | null {
  const lat = data[campoLat];
  const lng = data[campoLng];
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
}
