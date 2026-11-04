import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes, buildEvent } from '../../../shared/domain/domain-event';
import { dentroDelRadio, ubicacionDe } from '../../../shared/domain/geo';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { INTEGRACION_REPOSITORY, IntegracionRepository } from '../domain/integracion.repository';

/*
 * Topes de las columnas: un valor que no entra hace fallar el insert, el webhook
 * responde error y el bus lo reintenta para siempre.
 */
/** `act-` + id tiene que entrar en los 64 de `refuerzo_evento.eventoId`. */
const LARGO_MAXIMO_ID = 60;
const LARGO_MAXIMO_TITULO = 200;
const CAPACIDAD_MAXIMA = 2_147_483_647;

/** Lo que Residuos necesita de una ActividadCreada, ya validado. */
interface ActividadLeida {
  actividadId: string;
  titulo: string | null;
  capacidad: number;
  punto: { lat: number; lng: number };
  inicio: Date;
  fin: Date;
  cancelada: boolean;
}

/**
 * Squad 3 · Recoleccion despues de un evento masivo.
 * Squad 6 · Reserva de espacio publico + limpieza a la salida.
 *
 * Espacios publica `ActividadCreada` y Residuos, segun la capacidad:
 *   - desde `INTEGRACION_CUPO_MINIMO_REFUERZO` (100) agenda la escuadrilla: desde
 *     la hora de fin y durante `INTEGRACION_HORAS_ZONA_EVENTO`, los contenedores
 *     cercanos entran a la ruta que genera CU-08 aunque no esten criticos. Reusa
 *     el refuerzo de CU-INT-01 y publica `RefuerzoProgramado` para Analitica.
 *     Cubre la reserva de una plaza para un evento comunitario chico;
 *   - desde `INTEGRACION_CAPACIDAD_MASIVA` (1000) ademas la guarda con sus
 *     contenedores, para mostrar la zona en el mapa.
 *
 * Si la reserva se cancela (`ActividadCreada` con estado `CANCELADA`, o un
 * evento de cancelacion aparte), se borran el refuerzo y la zona del mapa.
 *
 * Lee los campos del contrato del squad (E1 en plan-squad-3.md), que es como
 * Espacios lo publica en el bus.
 *
 * Un evento mal formado se ignora y queda en el log, sin responder 400: un 400
 * hace que el bus lo reintente para siempre.
 */
@Injectable()
export class ActividadesMasivasService {
  private readonly logger = new Logger(ActividadesMasivasService.name);

  private readonly radioMetros: number;
  private readonly cupoMinimoRefuerzo: number;
  private readonly capacidadMasiva: number;
  private readonly horasZonaEvento: number;

  constructor(
    @Inject(INTEGRACION_REPOSITORY)
    private readonly integracion: IntegracionRepository,
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventos: EventPublisher,
    config: ConfigService,
  ) {
    this.radioMetros = Number(config.get('INTEGRACION_RADIO_METROS', 300));
    this.cupoMinimoRefuerzo = Number(config.get('INTEGRACION_CUPO_MINIMO_REFUERZO', 100));
    this.capacidadMasiva = Number(config.get('INTEGRACION_CAPACIDAD_MASIVA', 1000));
    this.horasZonaEvento = Number(config.get('INTEGRACION_HORAS_ZONA_EVENTO', 6));
  }

  async registrar(data: Record<string, unknown>): Promise<void> {
    const actividad = leerActividad(data);

    if (!actividad) {
      this.logger.warn(`ActividadCreada ignorada, mal formada: ${JSON.stringify(data)}`);
      return;
    }
    if (actividad.cancelada) {
      await this.borrar(actividad.actividadId);
      return;
    }
    if (actividad.capacidad < this.cupoMinimoRefuerzo) {
      return;
    }

    const activos = await this.contenedores.listar({ soloActivos: true });
    const contenedorIds = dentroDelRadio(actividad.punto, activos, this.radioMetros).map(
      ({ item }) => item.id,
    );

    // La zona en el mapa queda solo para los eventos masivos.
    if (actividad.capacidad >= this.capacidadMasiva) {
      await this.integracion.guardarActividad({
        actividadId: actividad.actividadId,
        titulo: actividad.titulo,
        capacidad: actividad.capacidad,
        lat: actividad.punto.lat,
        lng: actividad.punto.lng,
        inicio: actividad.inicio,
        fin: actividad.fin,
        contenedorIds,
      });
    }

    if (contenedorIds.length > 0) {
      const eventoId = idRefuerzo(actividad.actividadId);

      await this.integracion.guardarRefuerzo({
        eventoId,
        zona: null,
        contenedorIds,
        desde: actividad.fin,
        hasta: new Date(actividad.fin.getTime() + this.horasZonaEvento * 3_600_000),
      });

      await this.eventos.publish(
        buildEvent(EventTypes.REFUERZO_PROGRAMADO, {
          refuerzoId: `refuerzo-${eventoId}`,
          eventoId,
          zona: '',
          contenedores: contenedorIds.length,
          programadoPara: actividad.fin.toISOString(),
        }),
      );
    }
  }

  /**
   * Cancelacion de la reserva por un evento aparte. El nombre todavia no esta
   * confirmado con Espacios (ver IntegracionService): se acepta el id como
   * `actividadId` o, como en CASO-RESERVA-ESPACIOS de EDA, como `reservaId`.
   * Borrar algo que no existe no hace nada, asi que un repetido no molesta.
   */
  async cancelar(data: Record<string, unknown>): Promise<void> {
    const id = [data.actividadId, data.reservaId].find(esIdValido);

    if (!id) {
      this.logger.warn(`Cancelacion de actividad ignorada, sin id: ${JSON.stringify(data)}`);
      return;
    }

    await this.borrar(id);
  }

  /** Saca los contenedores del ruteo y la zona del mapa. */
  private async borrar(actividadId: string): Promise<void> {
    await this.integracion.borrarRefuerzo(idRefuerzo(actividadId));
    await this.integracion.borrarActividad(actividadId);
  }

  /**
   * Zonas para el mapa: las actividades que no terminaron y las que terminaron
   * hace menos de `INTEGRACION_HORAS_ZONA_EVENTO`, que es cuando la escuadrilla
   * esta limpiando.
   */
  async paraMapa(ahora = new Date()) {
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
}

/**
 * Prefijo propio: el id de Espacios podria coincidir con el de un
 * EventoComunitarioPublicado y pisaria el refuerzo de CU-INT-01.
 */
function idRefuerzo(actividadId: string): string {
  return `act-${actividadId}`;
}

function esIdValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= LARGO_MAXIMO_ID;
}

/** null si falta el id, la ubicacion o una fecha valida, o si la capacidad no es un entero. */
function leerActividad(data: Record<string, unknown>): ActividadLeida | null {
  const { actividadId, titulo, estado } = data;
  const capacidad = Number(data.capacidad ?? 0);
  const punto = ubicacionDe(data);
  const inicio = leerFecha(data.fechaHoraInicio);
  const fin = leerFecha(data.fechaHoraFinalizacion);

  if (
    !esIdValido(actividadId) ||
    !Number.isInteger(capacidad) ||
    capacidad > CAPACIDAD_MAXIMA ||
    !punto ||
    !inicio ||
    !fin
  ) {
    return null;
  }

  return {
    actividadId,
    titulo: typeof titulo === 'string' ? titulo.slice(0, LARGO_MAXIMO_TITULO) : null,
    capacidad,
    punto,
    inicio,
    fin,
    // En el nucleo siempre llega PROGRAMADA; el contrato deja lugar a CANCELADA.
    cancelada: estado === 'CANCELADA',
  };
}

/** Las fechas llegan en milisegundos (timestamp-millis de Avro). */
function leerFecha(valor: unknown): Date | null {
  if (typeof valor !== 'number') {
    return null;
  }

  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
