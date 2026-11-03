import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes, buildEvent } from '../../../shared/domain/domain-event';
import { Punto, dentroDelRadio, ubicacionDe } from '../../../shared/domain/geo';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { INTEGRACION_REPOSITORY, IntegracionRepository } from '../domain/integracion.repository';
import { EstadoIntervencion, Intervencion } from '../domain/intervencion.entity';
import { INTERVENCION_REPOSITORY, IntervencionRepository } from '../domain/intervencion.repository';

/** Causa que Emergencias marca cuando el accidente se relaciono con residuos. */
export const CAUSA_RESIDUOS = 'RESIDUOS';

export type ResultadoIntervencion = 'programada' | 'sin_causa_residuos' | 'duplicada' | 'ignorada';

/**
 * Intervencion por emergencia (CU-01 de Emergencias, alternativa A7).
 *
 * Reacciona solo si `causasRelacionadas` incluye RESIDUOS; con cualquier otra
 * causa (VIA, ESPACIO_PUBLICO) no hace nada operativo. Un evento mal formado o
 * sin ubicacion se ignora y se loguea, nunca se rechaza: un 400 hace que el bus
 * lo reintente para siempre.
 *
 * Lo llama IntegracionService dentro de su transaccion, asi que la intervencion,
 * el refuerzo y los eventos de salida se confirman juntos o ninguno.
 */
@Injectable()
export class IntervencionesService {
  private readonly logger = new Logger(IntervencionesService.name);

  private readonly radioMetros: number;
  private readonly ventanaRefuerzoHoras: number;

  constructor(
    @Inject(INTERVENCION_REPOSITORY)
    private readonly intervenciones: IntervencionRepository,
    @Inject(INTEGRACION_REPOSITORY)
    private readonly integracion: IntegracionRepository,
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventos: EventPublisher,
    config: ConfigService,
    private readonly transaccion: ContextoTransaccional,
  ) {
    // Mas chico que el radio de las emergencias (300 m) a proposito: si la causa
    // es un contenedor en la ciclovia, esta a pocos metros; a 300 m agarraria
    // uno que no tiene nada que ver.
    this.radioMetros = Number(config.get('INTEGRACION_RADIO_INTERVENCION_METROS', 50));
    this.ventanaRefuerzoHoras = Number(config.get('INTEGRACION_VENTANA_REFUERZO_HORAS', 12));
  }

  async programarSiCorresponde(data: Record<string, unknown>): Promise<ResultadoIntervencion> {
    if (!tieneCausaResiduos(data)) {
      return 'sin_causa_residuos';
    }

    const emergenciaId = leerEmergenciaId(data);
    const punto = ubicacionDe(data);

    if (!emergenciaId || !punto) {
      this.logger.warn(
        'Emergencia con causa RESIDUOS sin emergenciaId o ubicacion: no se programa intervencion',
      );
      return 'ignorada';
    }

    const cercano = await this.contenedorMasCercano(punto);
    const ahora = new Date();

    const intervencion = await this.intervenciones.crearSiNoExiste({
      emergenciaId,
      lat: punto.lat,
      lng: punto.lng,
      contenedorId: cercano?.id ?? null,
      distanciaMetros: cercano ? Math.round(cercano.distancia) : null,
      programadaEn: ahora,
    });

    if (!intervencion) {
      return 'duplicada';
    }

    await this.eventos.publish(
      buildEvent(
        EventTypes.INTERVENCION_PROGRAMADA,
        {
          intervencionId: intervencion.id,
          emergenciaId,
          contenedorId: intervencion.contenedorId,
          ubicacion: punto,
          programadaEn: ahora.toISOString(),
        },
        { correlationId: emergenciaId },
      ),
    );

    if (cercano) {
      await this.reforzar(emergenciaId, cercano.id, ahora);
    }

    return 'programada';
  }

  listar(): Promise<Intervencion[]> {
    return this.intervenciones.listar();
  }

  async obtener(id: string): Promise<Intervencion> {
    const intervencion = await this.intervenciones.buscar(id);
    if (!intervencion) {
      throw new NotFoundException({
        message: `No existe la intervencion ${id}`,
        code: 'INTERVENCION_NO_ENCONTRADA',
      });
    }
    return intervencion;
  }

  /**
   * El operador marca que la cuadrilla ya intervino en el lugar. Publica
   * `residuos.intervencion.completada`, que el catalogo del caso lista como
   * evento de Residuos.
   */
  async completar(id: string): Promise<Intervencion> {
    return this.transaccion.ejecutar(async () => {
      const intervencion = await this.obtener(id);
      const completadaEn = new Date();

      // El UPDATE condicional es lo que decide, no la lectura de arriba: con dos
      // operadores a la vez los dos leen PROGRAMADA, pero solo uno cambia la fila.
      if (
        intervencion.estado === EstadoIntervencion.COMPLETADA ||
        !(await this.intervenciones.completarSiProgramada(id, completadaEn))
      ) {
        throw new ConflictException({
          message: 'La intervencion ya esta completada',
          code: 'INTERVENCION_YA_COMPLETADA',
        });
      }

      await this.eventos.publish(
        buildEvent(
          EventTypes.INTERVENCION_COMPLETADA,
          {
            intervencionId: intervencion.id,
            emergenciaId: intervencion.emergenciaId,
            completadaEn: completadaEn.toISOString(),
          },
          { correlationId: intervencion.emergenciaId },
        ),
      );

      return { ...intervencion, estado: EstadoIntervencion.COMPLETADA, completadaEn };
    });
  }

  /**
   * Hace que la proxima ruta pase por el contenedor aunque no este critico.
   *
   * No publica RefuerzoProgramado: ese evento alimenta el dashboard de eventos
   * de Analitica con un `eventoId` de Espacios, y un refuerzo por emergencia no
   * es de ningun evento comunitario. Para ellos alcanza con IntervencionProgramada.
   *
   * No se filtran los FUERA_DE_SERVICIO al buscarlo: uno roto en la ciclovia
   * puede ser justamente la causa.
   */
  private async reforzar(emergenciaId: string, contenedorId: string, desde: Date): Promise<void> {
    const eventoId = `emergencia-${emergenciaId}`;
    const hasta = new Date(desde.getTime() + this.ventanaRefuerzoHoras * 3_600_000);

    await this.integracion.guardarRefuerzo({
      eventoId,
      zona: null,
      contenedorIds: [contenedorId],
      desde,
      hasta,
    });
  }

  private async contenedorMasCercano(punto: Punto) {
    const activos = await this.contenedores.listar({ soloActivos: true });

    return dentroDelRadio(punto, activos, this.radioMetros)
      .map(({ item, distancia }) => ({ id: item.id, distancia }))
      .sort((a, b) => a.distancia - b.distancia)[0];
  }
}

function tieneCausaResiduos(data: Record<string, unknown>): boolean {
  const causas = data.causasRelacionadas;
  return (
    Array.isArray(causas) &&
    causas.some((c) => typeof c === 'string' && c.toUpperCase() === CAUSA_RESIDUOS)
  );
}

function leerEmergenciaId(data: Record<string, unknown>): string | null {
  const id = data.emergenciaId ?? data.correlationId;
  return typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : null;
}
