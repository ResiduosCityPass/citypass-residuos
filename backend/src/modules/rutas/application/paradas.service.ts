import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes, buildEvent } from '../../../shared/domain/domain-event';
import {
  EstadoCamion,
  EstadoContenedor,
  EstadoParada,
  EstadoRuta,
  TipoAlerta,
} from '../../../shared/domain/enums';
import { distanciaMetros } from '../../../shared/domain/geo';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { AlertasService } from '../../alertas/application/alertas.service';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { FlotaService } from '../../flota/application/flota.service';
import { Parada } from '../domain/parada.entity';
import { PARADA_REPOSITORY, ParadaRepository } from '../domain/parada.repository';
import { Ruta } from '../domain/ruta.entity';
import { RUTA_REPOSITORY, RutaRepository } from '../domain/ruta.repository';
import { ConfirmarParadaDto } from './dto/confirmar-parada.dto';
import { OmitirParadaDto } from './dto/omitir-parada.dto';

export const RADIO_CONFIRMACION_DEFAULT_METROS = 100;

/** Transicion completa que devuelve el confirmar, para no tener que volver a pedir todo. */
export interface ResultadoConfirmacion {
  paradaId: string;
  estado: EstadoParada;
  confirmadaEn: Date;
  contenedorId: string;
  estadoContenedor: EstadoContenedor;
  nivelLlenadoPct: number;
  alertasCerradas: number;
  rutaEstado: EstadoRuta;
  distanciaMetros: number;
}

/**
 * Resultado de omitir una parada. Es la misma forma que la confirmacion menos
 * `alertasCerradas`, y esa ausencia es el punto: omitir no resuelve nada, el
 * contenedor sigue lleno y su alerta sigue abierta.
 */
export interface ResultadoOmision {
  paradaId: string;
  estado: EstadoParada;
  omitidaEn: Date;
  motivo: string;
  contenedorId: string;
  estadoContenedor: EstadoContenedor;
  nivelLlenadoPct: number;
  rutaEstado: EstadoRuta;
}

/**
 * CU-10 · Confirmar vaciado.
 *
 * Es el paso que completa el circulo: el contenedor vuelve a verde, sus alertas
 * de saturacion se cierran y se publica el evento. Todo en una transaccion:
 * dejar la parada confirmada sin cerrar las alertas seria peor que no
 * confirmarla.
 */
@Injectable()
export class ParadasService {
  private readonly radioMetros: number;

  constructor(
    @Inject(PARADA_REPOSITORY)
    private readonly paradas: ParadaRepository,
    @Inject(RUTA_REPOSITORY)
    private readonly rutas: RutaRepository,
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventos: EventPublisher,
    private readonly alertas: AlertasService,
    private readonly flota: FlotaService,
    private readonly transaccion: ContextoTransaccional,
    config: ConfigService,
  ) {
    this.radioMetros = Number(
      config.get('RADIO_CONFIRMACION_VACIADO_METROS', RADIO_CONFIRMACION_DEFAULT_METROS),
    );
  }

  async confirmar(
    paradaId: string,
    choferId: string,
    posicion: ConfirmarParadaDto,
  ): Promise<ResultadoConfirmacion> {
    return this.transaccion.ejecutar(() =>
      this.confirmarEnTransaccion(paradaId, choferId, posicion),
    );
  }

  private async confirmarEnTransaccion(
    paradaId: string,
    choferId: string,
    posicion: ConfirmarParadaDto,
  ): Promise<ResultadoConfirmacion> {
    const { parada, ruta } = await this.buscarParadaPendiente(paradaId, choferId);

    const contenedor = await this.contenedores.buscarPorId(parada.contenedorId);

    if (!contenedor) {
      throw new NotFoundException({
        message: `No existe el contenedor de la parada ${parada.orden}`,
        code: 'CONTENEDOR_NO_ENCONTRADO',
      });
    }

    const metros = Math.round(distanciaMetros(posicion, contenedor));

    if (metros > this.radioMetros) {
      throw new ForbiddenException({
        message:
          `Estas a ${metros} m del contenedor ${contenedor.codigo}. ` +
          `El maximo permitido es ${this.radioMetros} m`,
        code: 'PARADA_FUERA_DE_RADIO',
      });
    }

    const confirmadaEn = new Date();
    const nivelPrevio = contenedor.nivelLlenadoPct;

    parada.estado = EstadoParada.CONFIRMADA;
    parada.confirmadaEn = confirmadaEn;
    await this.paradas.guardar(parada);

    contenedor.nivelLlenadoPct = 0;
    // Un contenedor fuera de servicio no vuelve a NORMAL por vaciarlo: lo que
    // tiene roto es el sensor o la tapa, no el nivel.
    if (contenedor.estado !== EstadoContenedor.FUERA_DE_SERVICIO) {
      contenedor.estado = EstadoContenedor.NORMAL;
    }
    await this.contenedores.guardar(contenedor);

    const alertasCerradas = await this.alertas.resolverAbiertasPorTipo(
      contenedor.id,
      TipoAlerta.SATURACION,
    );

    const estadoRuta = await this.avanzarRuta(parada.rutaId);

    await this.eventos.publish(
      buildEvent(
        EventTypes.CONTENEDOR_VACIADO,
        {
          contenedorId: contenedor.codigo,
          rutaId: parada.rutaId,
          camionId: ruta.camion?.patente ?? ruta.camionId,
          choferId,
          nivelPrevio,
          confirmadoEn: confirmadaEn.toISOString(),
        },
        { occurredAt: confirmadaEn },
      ),
    );

    return {
      paradaId: parada.id,
      estado: parada.estado,
      confirmadaEn,
      contenedorId: contenedor.id,
      estadoContenedor: contenedor.estado,
      nivelLlenadoPct: contenedor.nivelLlenadoPct,
      alertasCerradas,
      rutaEstado: estadoRuta,
      distanciaMetros: metros,
    };
  }

  /**
   * CU-10 · El chofer llego pero no pudo vaciar.
   *
   * Es el otro final de la parada, y hasta ahora no existia: sin el, una calle
   * cortada o un auto mal estacionado dejaban la ruta trabada para siempre en
   * EN_CURSO y el camion tomado, porque la ruta solo se cierra cuando no queda
   * ninguna parada PENDIENTE.
   *
   * A diferencia de confirmar, no toca el contenedor ni sus alertas: sigue
   * lleno y su alerta sigue abierta, que es exactamente lo que el operador
   * tiene que ver. Tampoco pide estar a menos de 100 m: el caso tipico es no
   * poder acercarse.
   */
  async omitir(
    paradaId: string,
    choferId: string,
    dto: OmitirParadaDto,
  ): Promise<ResultadoOmision> {
    return this.transaccion.ejecutar(() => this.omitirEnTransaccion(paradaId, choferId, dto));
  }

  private async omitirEnTransaccion(
    paradaId: string,
    choferId: string,
    dto: OmitirParadaDto,
  ): Promise<ResultadoOmision> {
    const { parada, ruta } = await this.buscarParadaPendiente(paradaId, choferId);

    const contenedor = await this.contenedores.buscarPorId(parada.contenedorId);

    if (!contenedor) {
      throw new NotFoundException({
        message: `No existe el contenedor de la parada ${parada.orden}`,
        code: 'CONTENEDOR_NO_ENCONTRADO',
      });
    }

    const omitidaEn = new Date();

    parada.estado = EstadoParada.OMITIDA;
    parada.omitidaEn = omitidaEn;
    parada.motivo = dto.motivo;
    await this.paradas.guardar(parada);

    const estadoRuta = await this.avanzarRuta(parada.rutaId);

    await this.eventos.publish(
      buildEvent(
        EventTypes.PARADA_OMITIDA,
        {
          paradaId: parada.id,
          rutaId: parada.rutaId,
          contenedorId: contenedor.codigo,
          camionId: ruta.camion?.patente ?? ruta.camionId,
          choferId,
          motivo: dto.motivo,
          nivelLlenadoPct: contenedor.nivelLlenadoPct,
          omitidaEn: omitidaEn.toISOString(),
        },
        { occurredAt: omitidaEn },
      ),
    );

    return {
      paradaId: parada.id,
      estado: parada.estado,
      omitidaEn,
      motivo: dto.motivo,
      contenedorId: contenedor.id,
      estadoContenedor: contenedor.estado,
      nivelLlenadoPct: contenedor.nivelLlenadoPct,
      rutaEstado: estadoRuta,
    };
  }

  /**
   * Los dos finales de una parada comparten los mismos tres chequeos: que
   * exista, que sea de la ruta de quien la esta cerrando, y que siga abierta.
   *
   * Una parada cerrada no se reabre, ni confirmada ni omitida. Si el auto que
   * tapaba el contenedor se movio, se genera una ruta nueva: reabrirla obligaria
   * a revivir una ruta que ya paso a COMPLETADA y a devolver a EN_RUTA un camion
   * que ya se libero.
   */
  private async buscarParadaPendiente(
    paradaId: string,
    choferId: string,
  ): Promise<{ parada: Parada; ruta: Ruta }> {
    const parada = await this.paradas.buscarPorId(paradaId);

    if (!parada) {
      throw new NotFoundException({
        message: `No existe la parada ${paradaId}`,
        code: 'PARADA_NO_ENCONTRADA',
      });
    }

    const ruta = await this.rutas.buscarPorId(parada.rutaId);

    // Un chofer solo cierra paradas de su propia ruta. Sin esto, cualquiera con
    // un id de parada podria cerrar el trabajo de otro.
    if (!ruta || ruta.choferId !== choferId) {
      throw new ForbiddenException({
        message: 'Esta parada no pertenece a tu ruta activa',
        code: 'PARADA_DE_OTRA_RUTA',
      });
    }

    if (parada.estado === EstadoParada.CONFIRMADA) {
      throw new ConflictException({
        message: `La parada ${parada.orden} ya fue confirmada`,
        code: 'PARADA_YA_CONFIRMADA',
      });
    }

    if (parada.estado === EstadoParada.OMITIDA) {
      throw new ConflictException({
        message: `La parada ${parada.orden} ya fue omitida: ${parada.motivo}`,
        code: 'PARADA_YA_OMITIDA',
      });
    }

    return { parada, ruta };
  }

  /**
   * La primera confirmacion arranca la ruta; la ultima la cierra y libera el
   * camion. Sin esto, un camion quedaria EN_RUTA para siempre y no se podria
   * volver a usar: es la trampa que CU-03 evita del otro lado.
   */
  private async avanzarRuta(rutaId: string): Promise<EstadoRuta> {
    const ruta = await this.rutas.buscarPorId(rutaId);

    if (!ruta) {
      throw new NotFoundException({
        message: `No existe la ruta ${rutaId}`,
        code: 'RUTA_NO_ENCONTRADA',
      });
    }

    const paradas = await this.paradas.listarDeRuta(rutaId);
    const quedanPendientes = paradas.some((p) => p.estado === EstadoParada.PENDIENTE);

    if (quedanPendientes) {
      if (ruta.estado === EstadoRuta.ASIGNADA) {
        ruta.estado = EstadoRuta.EN_CURSO;
        await this.rutas.guardar(ruta);
      }

      return ruta.estado;
    }

    ruta.estado = EstadoRuta.COMPLETADA;
    ruta.completadaEn = new Date();
    await this.rutas.guardar(ruta);

    const camion = await this.flota.obtener(ruta.camionId);
    camion.estado = EstadoCamion.DISPONIBLE;
    await this.flota.guardarEstado(camion);

    return ruta.estado;
  }
}
