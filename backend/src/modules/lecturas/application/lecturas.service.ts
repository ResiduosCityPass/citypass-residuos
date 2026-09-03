import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoContenedor, TipoAlerta } from '../../../shared/domain/enums';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { AlertasService } from '../../alertas/application/alertas.service';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { Sensor } from '../../contenedores/domain/sensor.entity';
import { SENSOR_REPOSITORY, SensorRepository } from '../../contenedores/domain/sensor.repository';
import { ZonasService } from '../../zonas/application/zonas.service';
import { Zona } from '../../zonas/domain/zona.entity';
import { Lectura } from '../domain/lectura.entity';
import { LECTURA_REPOSITORY, LecturaRepository } from '../domain/lectura.repository';
import {
  BATERIA_BAJA_PCT,
  MARGEN_ADVERTENCIA_PCT_DEFAULT,
  esTransicionACritico,
  estadoSensorPorBateria,
  evaluarEstadoContenedor,
  hayRiesgoDeIncendio,
  severidadPorSaturacion,
} from '../domain/reglas/evaluador-estado';

export interface ResultadoIngesta {
  lecturaId: string;
  contenedorId: string;
  estadoAnterior: EstadoContenedor;
  estadoNuevo: EstadoContenedor;
  alertasGeneradas: TipoAlerta[];
}

/**
 * CU-04 · Ingesta de lecturas. Es el disparador de todo el dominio.
 *
 * Orquesta, en este orden: valida contra la ultima lectura, persiste, actualiza
 * el contenedor y el sensor, y recien despues evalua las reglas de CU-05 y CU-06.
 *
 * Todo el flujo corre dentro de una transaccion: la lectura, el estado del
 * sensor, el del contenedor, las alertas y el evento en la tabla outbox se
 * guardan juntos o no se guarda ninguno. Sin eso, un fallo en el medio dejaba
 * el contenedor marcado critico sin su alerta, o la alerta sin el evento que
 * la anuncia.
 *
 * La publicacion real la hace despues el despachador del outbox, fuera de esta
 * transaccion: asi una falla del broker no revierte el cambio de negocio, y el
 * evento se reintenta en vez de perderse (ADR-003).
 */
@Injectable()
export class LecturasService {
  private readonly logger = new Logger(LecturasService.name);
  private readonly margenAdvertenciaPct: number;

  constructor(
    @Inject(LECTURA_REPOSITORY)
    private readonly lecturas: LecturaRepository,
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(SENSOR_REPOSITORY)
    private readonly sensores: SensorRepository,
    private readonly zonas: ZonasService,
    private readonly alertas: AlertasService,
    private readonly transaccion: ContextoTransaccional,
    config: ConfigService,
  ) {
    this.margenAdvertenciaPct = config.get<number>(
      'MARGEN_ADVERTENCIA_PCT',
      MARGEN_ADVERTENCIA_PCT_DEFAULT,
    );
  }

  async registrar(
    sensor: Sensor,
    datos: {
      nivelLlenadoPct: number;
      temperaturaC: number;
      bateriaPct: number;
      registradaEn?: Date;
    },
  ): Promise<ResultadoIngesta> {
    return this.transaccion.ejecutar(() => this.registrarEnTransaccion(sensor, datos));
  }

  private async registrarEnTransaccion(
    sensor: Sensor,
    datos: {
      nivelLlenadoPct: number;
      temperaturaC: number;
      bateriaPct: number;
      registradaEn?: Date;
    },
  ): Promise<ResultadoIngesta> {
    const contenedor = await this.contenedores.buscarPorId(sensor.contenedorId);

    if (!contenedor) {
      throw new NotFoundException({
        message: `El sensor ${sensor.codigo} no tiene un contenedor asociado valido`,
        code: 'CONTENEDOR_NO_ENCONTRADO',
      });
    }

    const registradaEn = datos.registradaEn ?? new Date();
    await this.verificarCronologia(contenedor.id, registradaEn);

    const lectura = await this.lecturas.crear({
      contenedorId: contenedor.id,
      nivelLlenadoPct: datos.nivelLlenadoPct,
      temperaturaC: datos.temperaturaC,
      bateriaPct: datos.bateriaPct,
      registradaEn,
    });

    await this.actualizarSensor(sensor, datos.bateriaPct, registradaEn);

    // La zona se pide una unica vez y se pasa hacia abajo: evaluar el estado y
    // evaluar las reglas necesitan los mismos umbrales. Consultarla dos veces
    // duplicaba la lectura en el endpoint mas caliente del modulo, y abria la
    // puerta a evaluar el estado y las alertas contra dos versiones distintas
    // de la zona si alguien la editaba en el medio.
    const zona = await this.zonas.obtener(contenedor.zonaId);

    const estadoAnterior = contenedor.estado;
    const estadoNuevo = await this.actualizarContenedor(contenedor, lectura, zona);
    const alertasGeneradas = await this.evaluarReglas(
      contenedor,
      zona,
      estadoAnterior,
      estadoNuevo,
      datos.bateriaPct,
    );

    return {
      lecturaId: lectura.id,
      contenedorId: contenedor.id,
      estadoAnterior,
      estadoNuevo,
      alertasGeneradas,
    };
  }

  /**
   * Una lectura con timestamp anterior a la ultima registrada llegaria fuera de
   * orden y corromperia el estado desnormalizado del contenedor. Se rechaza.
   */
  private async verificarCronologia(contenedorId: string, registradaEn: Date): Promise<void> {
    const ultima = await this.lecturas.ultimaDe(contenedorId);

    if (ultima && registradaEn.getTime() <= ultima.registradaEn.getTime()) {
      throw new ConflictException({
        message:
          `Ya hay una lectura de este contenedor en ${ultima.registradaEn.toISOString()} ` +
          `o posterior. La lectura recibida (${registradaEn.toISOString()}) llega fuera de orden.`,
        code: 'LECTURA_FUERA_DE_ORDEN',
      });
    }
  }

  private async actualizarSensor(
    sensor: Sensor,
    bateriaPct: number,
    registradaEn: Date,
  ): Promise<void> {
    sensor.bateriaPct = bateriaPct;
    sensor.ultimoReporteEn = registradaEn;
    sensor.estado = estadoSensorPorBateria(bateriaPct);

    await this.sensores.guardar(sensor);
  }

  private async actualizarContenedor(
    contenedor: Contenedor,
    lectura: Lectura,
    zona: Zona,
  ): Promise<EstadoContenedor> {
    const estadoNuevo = evaluarEstadoContenedor(
      lectura,
      zona,
      contenedor.estado,
      this.margenAdvertenciaPct,
    );

    contenedor.nivelLlenadoPct = lectura.nivelLlenadoPct;
    contenedor.temperaturaC = lectura.temperaturaC;
    contenedor.ultimaLecturaEn = lectura.registradaEn;
    contenedor.estado = estadoNuevo;

    await this.contenedores.guardar(contenedor);

    return estadoNuevo;
  }

  /** CU-05 y CU-06. El contenedor ya viene con la ultima lectura aplicada. */
  private async evaluarReglas(
    contenedor: Contenedor,
    zona: Zona,
    estadoAnterior: EstadoContenedor,
    estadoNuevo: EstadoContenedor,
    bateriaPct: number,
  ): Promise<TipoAlerta[]> {
    const generadas: TipoAlerta[] = [];

    // CU-06 primero: el incendio es de maxima prioridad y no depende del llenado.
    if (
      hayRiesgoDeIncendio(contenedor as { nivelLlenadoPct: number; temperaturaC: number }, zona)
    ) {
      const alerta = await this.alertas.registrarIncendio(contenedor, zona);

      if (alerta) {
        generadas.push(TipoAlerta.INCENDIO);
        this.logger.warn(`Riesgo de incendio en ${contenedor.codigo}: ${contenedor.temperaturaC}C`);
      }
    }

    // CU-05: solo en la transicion, para no duplicar alertas.
    if (esTransicionACritico(estadoAnterior, estadoNuevo)) {
      const alerta = await this.alertas.registrarSaturacion(
        contenedor,
        zona,
        severidadPorSaturacion(contenedor.nivelLlenadoPct, zona.umbralCriticoPct),
      );

      if (alerta) {
        generadas.push(TipoAlerta.SATURACION);
      }
    }

    if (bateriaPct <= BATERIA_BAJA_PCT) {
      const alerta = await this.alertas.registrarBateriaBaja(contenedor.id, bateriaPct);

      if (alerta) {
        generadas.push(TipoAlerta.BATERIA_BAJA);
      }
    }

    return generadas;
  }
}
