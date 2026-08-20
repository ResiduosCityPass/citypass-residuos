import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventTypes, buildEvent } from '../../../shared/domain/domain-event';
import { EstadoAlerta, Severidad, TipoAlerta } from '../../../shared/domain/enums';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { Zona } from '../../zonas/domain/zona.entity';
import { Alerta } from '../domain/alerta.entity';
import { ALERTA_REPOSITORY, AlertaRepository, FiltroAlertas } from '../domain/alerta.repository';

/**
 * Alertas del modulo (CU-05, CU-06).
 *
 * Es el unico lugar que crea alertas y publica sus eventos, para que la regla de
 * "no duplicar" viva en un solo sitio.
 */
@Injectable()
export class AlertasService {
  constructor(
    @Inject(ALERTA_REPOSITORY)
    private readonly alertas: AlertaRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventos: EventPublisher,
  ) {}

  /**
   * CU-05 · Registra la saturacion y publica `residuos.contenedor.critico`.
   *
   * El llamador ya verifico que se trata de una transicion a critico; aca se
   * agrega una segunda guarda contra alertas abiertas, por si dos lecturas del
   * mismo sensor llegan casi simultaneas.
   */
  async registrarSaturacion(
    contenedor: Contenedor,
    zona: Zona,
    severidad: Severidad,
  ): Promise<Alerta | null> {
    const abierta = await this.alertas.buscarAbierta(contenedor.id, TipoAlerta.SATURACION);

    if (abierta) {
      return null;
    }

    const detectadaEn = new Date();
    const alerta = await this.alertas.crear({
      contenedorId: contenedor.id,
      tipo: TipoAlerta.SATURACION,
      severidad,
      estado: EstadoAlerta.ABIERTA,
      detectadaEn,
      detalle:
        `Nivel ${contenedor.nivelLlenadoPct}% supera el umbral ` +
        `${zona.umbralCriticoPct}% de la zona ${zona.nombre}`,
    });

    await this.eventos.publish(
      buildEvent(
        EventTypes.CONTENEDOR_CRITICO,
        {
          contenedorId: contenedor.codigo,
          zonaId: zona.nombre,
          tipoResiduo: contenedor.tipoResiduo,
          nivelLlenado: contenedor.nivelLlenadoPct,
          umbralConfigurado: zona.umbralCriticoPct,
          ubicacion: { lat: contenedor.lat, lng: contenedor.lng },
          detectadoEn: detectadaEn.toISOString(),
        },
        { occurredAt: detectadaEn },
      ),
    );

    return alerta;
  }

  /**
   * CU-06 · Registra el riesgo de incendio y publica `residuos.incendio.detectado`.
   *
   * Es el evento de maxima prioridad del modulo y el que consume Emergencias
   * (Squad 6): dispara un incidente en su modulo sin ninguna llamada sincronica.
   */
  async registrarIncendio(contenedor: Contenedor, zona: Zona): Promise<Alerta | null> {
    const abierta = await this.alertas.buscarAbierta(contenedor.id, TipoAlerta.INCENDIO);

    if (abierta) {
      return null;
    }

    const detectadaEn = new Date();
    const alerta = await this.alertas.crear({
      contenedorId: contenedor.id,
      tipo: TipoAlerta.INCENDIO,
      severidad: Severidad.CRITICA,
      estado: EstadoAlerta.ABIERTA,
      detectadaEn,
      detalle:
        `Temperatura interna ${contenedor.temperaturaC}C supera el umbral ` +
        `${zona.umbralTemperaturaC}C de la zona ${zona.nombre}`,
    });

    await this.eventos.publish(
      buildEvent(
        EventTypes.INCENDIO_DETECTADO,
        {
          contenedorId: contenedor.codigo,
          zonaId: zona.nombre,
          temperaturaCelsius: contenedor.temperaturaC,
          umbralConfigurado: zona.umbralTemperaturaC,
          ubicacion: { lat: contenedor.lat, lng: contenedor.lng },
          severidad: Severidad.CRITICA,
          detectadoEn: detectadaEn.toISOString(),
        },
        { occurredAt: detectadaEn },
      ),
    );

    return alerta;
  }

  /** Alerta de bateria baja del sensor. No publica evento: es mantenimiento interno. */
  async registrarBateriaBaja(contenedorId: string, bateriaPct: number): Promise<Alerta | null> {
    const abierta = await this.alertas.buscarAbierta(contenedorId, TipoAlerta.BATERIA_BAJA);

    if (abierta) {
      return null;
    }

    return this.alertas.crear({
      contenedorId,
      tipo: TipoAlerta.BATERIA_BAJA,
      severidad: Severidad.BAJA,
      estado: EstadoAlerta.ABIERTA,
      detectadaEn: new Date(),
      detalle: `Bateria del sensor al ${bateriaPct}%`,
    });
  }

  /** Cierra las alertas abiertas de un tipo. Lo usa CU-10 al confirmar el vaciado. */
  async resolverAbiertasPorTipo(contenedorId: string, tipo: TipoAlerta): Promise<number> {
    const abiertas = await this.alertas.listarAbiertasPorContenedor(contenedorId, tipo);

    for (const alerta of abiertas) {
      alerta.estado = EstadoAlerta.RESUELTA;
      alerta.resueltaEn = new Date();
      await this.alertas.guardar(alerta);
    }

    return abiertas.length;
  }

  listar(filtro: FiltroAlertas): Promise<Alerta[]> {
    return this.alertas.listar(filtro);
  }

  async obtener(id: string): Promise<Alerta> {
    const alerta = await this.alertas.buscarPorId(id);

    if (!alerta) {
      throw new NotFoundException({
        message: `No existe la alerta ${id}`,
        code: 'ALERTA_NO_ENCONTRADA',
      });
    }

    return alerta;
  }

  async atender(id: string): Promise<Alerta> {
    const alerta = await this.obtener(id);

    if (alerta.estado !== EstadoAlerta.ABIERTA) {
      throw new ConflictException({
        message: `La alerta esta en estado ${alerta.estado}, solo se puede atender una ABIERTA`,
        code: 'ALERTA_NO_ABIERTA',
      });
    }

    alerta.estado = EstadoAlerta.EN_ATENCION;

    return this.alertas.guardar(alerta);
  }

  async resolver(id: string): Promise<Alerta> {
    const alerta = await this.obtener(id);

    if (alerta.estado === EstadoAlerta.RESUELTA) {
      throw new ConflictException({
        message: 'La alerta ya estaba resuelta',
        code: 'ALERTA_YA_RESUELTA',
      });
    }

    alerta.estado = EstadoAlerta.RESUELTA;
    alerta.resueltaEn = new Date();

    return this.alertas.guardar(alerta);
  }
}
