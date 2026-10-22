import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes, buildEvent } from '../../../shared/domain/domain-event';
import { Punto, distanciaMetros } from '../../../shared/domain/geo';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { ParadasService } from '../../rutas/application/paradas.service';
import { OBSTRUCCION_REPOSITORY, ObstruccionRepository } from '../domain/integracion.repository';
import { interpretarReclamo } from '../domain/reglas/contrato-reclamos';

export const OBSTRUCCION_RADIO_METROS_DEFAULT = 15;
export const OBSTRUCCION_VIGENCIA_HORAS_DEFAULT = 4;

/**
 * CU-INT-02 · Reclamo de un auto que bloquea la bicisenda.
 *
 * Residuos decide si ese auto le impide al camion llegar a algun contenedor. Si
 * se lo impide, el contenedor sale del ruteo y las rutas vivas se recalculan.
 * El reclamo lo resuelve otro squad: aca solo se escucha el aviso.
 *
 * Corre dentro de la transaccion de `IntegracionService.procesar`, junto con el
 * registro del eventId.
 */
@Injectable()
export class ReclamosService {
  private readonly radioMetros: number;
  private readonly vigenciaMs: number;

  constructor(
    @Inject(OBSTRUCCION_REPOSITORY)
    private readonly obstrucciones: ObstruccionRepository,
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventos: EventPublisher,
    // forwardRef: rutas ya depende de integracion por los refuerzos y las obstrucciones.
    @Inject(forwardRef(() => ParadasService))
    private readonly paradas: Pick<ParadasService, 'quitarContenedores'>,
    config: ConfigService,
  ) {
    this.radioMetros = Number(
      config.get('OBSTRUCCION_RADIO_METROS', OBSTRUCCION_RADIO_METROS_DEFAULT),
    );
    this.vigenciaMs =
      Number(config.get('OBSTRUCCION_VIGENCIA_HORAS', OBSTRUCCION_VIGENCIA_HORAS_DEFAULT)) *
      3_600_000;
  }

  /** false si el evento no era un reclamo que nos sirva: el que llama lo da por ignorado. */
  async procesar(eventType: string, data: Record<string, unknown>): Promise<boolean> {
    const reclamo = interpretarReclamo(eventType, data);

    if (!reclamo) {
      return false;
    }

    if (reclamo.tipo === 'resuelto') {
      // Si no tapaba nada, o ya habia vencido, no hay nada que destapar: no es un error.
      await this.obstrucciones.resolverReclamo(reclamo.reclamoId, new Date());
      return true;
    }

    await this.evaluar(reclamo.reclamoId, reclamo.ubicacion);
    return true;
  }

  private async evaluar(reclamoId: string, auto: Punto): Promise<void> {
    const ahora = new Date();
    const venceEn = new Date(ahora.getTime() + this.vigenciaMs);

    // ponytail: recorre todos los contenedores activos en memoria, igual que los
    // refuerzos y bloqueos de CU-INT-01. Alcanza para cientos; con miles, pasar a
    // la consulta por radio de `ContenedorCercanoRepository`.
    const tapados = (await this.contenedores.listar({ soloActivos: true }))
      .map((contenedor) => ({ contenedor, distancia: distanciaMetros(auto, contenedor) }))
      .filter(({ distancia }) => distancia <= this.radioMetros);

    await this.obstrucciones.guardarObstrucciones(
      tapados.map(({ contenedor, distancia }) => ({
        reclamoId,
        contenedorId: contenedor.id,
        distanciaMetros: Number(distancia.toFixed(1)),
        venceEn,
      })),
    );

    const rutasRecalculadas =
      tapados.length > 0
        ? await this.paradas.quitarContenedores(
            tapados.map(({ contenedor }) => contenedor.id),
            `Acceso bloqueado por vehiculo (reclamo ${reclamoId})`,
            reclamoId,
          )
        : [];

    await this.eventos.publish(
      buildEvent(EventTypes.RECLAMO_EVALUADO, {
        reclamoId,
        afectaRecoleccion: tapados.length > 0,
        contenedoresAfectados: tapados.map(({ contenedor, distancia }) => ({
          codigo: contenedor.codigo,
          distanciaMetros: Number(distancia.toFixed(1)),
        })),
        rutasRecalculadas,
        bloqueadoHasta: tapados.length > 0 ? venceEn.toISOString() : null,
        evaluadoEn: ahora.toISOString(),
      }),
    );
  }
}
