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
import { PREFIJO_ACTIVIDAD, PREFIJO_RESERVA } from '../domain/refuerzo-evento.entity';

/*
 * Topes de las columnas: un valor que no entra hace fallar el insert, el webhook
 * responde error y el bus lo reintenta para siempre.
 */
/** `act-` + id tiene que entrar en los 64 de `refuerzo_evento.eventoId`. */
const LARGO_MAXIMO_ID = 60;
const LARGO_MAXIMO_TITULO = 200;
const CAPACIDAD_MAXIMA = 2_147_483_647;

/** Espacios publica los estados de sus actividades en ingles (`ACTIVE`). */
const ESTADOS_CANCELADA = new Set(['CANCELADA', 'CANCELLED']);

/** Lo que Residuos necesita de una ActividadCreada, ya validado. */
interface ActividadLeida {
  actividadId: string;
  titulo: string | null;
  capacidad: number;
  punto: { lat: number; lng: number };
  inicio: Date;
  fin: Date;
}

/**
 * Squad 3 · Recoleccion despues de un evento masivo.
 * Squad 6 · Reserva de espacio publico + limpieza a la salida.
 *
 * Espacios publica `ActividadCreada` y Residuos, segun la capacidad:
 *   - desde `INTEGRACION_CUPO_MINIMO_REFUERZO` (100) agenda la escuadrilla: desde
 *     la hora de fin y durante `INTEGRACION_HORAS_ZONA_EVENTO`, los contenedores
 *     cercanos entran a la ruta que genera CU-08 aunque no esten criticos. Reusa
 *     el refuerzo de CU-INT-01 y publica `RefuerzoProgramado`.
 *     Por debajo de 1000 el refuerzo es `res-<id>` (reserva de un evento
 *     comunitario chico) y desde ahi `act-<id>`: el prefijo decide si la
 *     IntervencionProgramada que lee Analitica sale como RESERVA o EVENTO_PUBLICO;
 *   - desde `INTEGRACION_CAPACIDAD_MASIVA` (1000) ademas la guarda con sus
 *     contenedores, para mostrar la zona en el mapa.
 *
 * Si Espacios cancela (`EventoCancelado`, `ActividadModificada` o una actividad
 * con estado cancelado), se borran los refuerzos y la zona, y queda anotado:
 * si la creacion llega despues, no se vuelve a agendar la limpieza.
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
    if (esEstadoCancelado(data.estado)) {
      await this.cancelar(data);
      return;
    }

    const actividad = leerActividad(data);

    if (!actividad) {
      this.logger.warn(`ActividadCreada ignorada, mal formada: ${JSON.stringify(data)}`);
      return;
    }
    if (await this.integracion.estaCancelada(actividad.actividadId)) {
      this.logger.log(`ActividadCreada ignorada, ya cancelada: ${actividad.actividadId}`);
      return;
    }
    if (actividad.capacidad < this.cupoMinimoRefuerzo) {
      return;
    }

    const activos = await this.contenedores.listar({ soloActivos: true });
    const contenedorIds = dentroDelRadio(actividad.punto, activos, this.radioMetros).map(
      ({ item }) => item.id,
    );

    const masiva = actividad.capacidad >= this.capacidadMasiva;

    // La zona en el mapa queda solo para los eventos masivos.
    if (masiva) {
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
      // Prefijo propio: el id de Espacios podria coincidir con el de un
      // EventoComunitarioPublicado y pisaria el refuerzo de CU-INT-01.
      const eventoId = `${masiva ? PREFIJO_ACTIVIDAD : PREFIJO_RESERVA}${actividad.actividadId}`;

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
   * Anota la cancelacion, retira todos los refuerzos asociados y borra la zona
   * del mapa. Una misma actividad puede tener mas de un refuerzo, si llegaron
   * `ActividadCreada` y `EventoComunitarioPublicado`. `eventoId` es el mismo valor
   * que `actividadId`, lo confirmo Espacios. Un repetido no molesta: borrar algo
   * que no existe no hace nada.
   */
  async cancelar(data: Record<string, unknown>): Promise<void> {
    const id = [data.actividadId, data.eventoId, data.reservaId].find(esIdValido);

    if (!id) {
      this.logger.warn(`Cancelacion de actividad ignorada, sin id: ${JSON.stringify(data)}`);
      return;
    }

    await this.integracion.registrarCancelacion(id);

    for (const eventoId of [id, `${PREFIJO_ACTIVIDAD}${id}`, `${PREFIJO_RESERVA}${id}`]) {
      await this.integracion.borrarRefuerzo(eventoId);
    }
    await this.integracion.borrarActividad(id);
  }

  /** Espacios cambio el estado de una actividad: solo importa si la cancelo. */
  async modificar(data: Record<string, unknown>): Promise<void> {
    if (esEstadoCancelado(data.estadoNuevo)) {
      await this.cancelar(data);
    }
  }

  /** Para el refuerzo de CU-INT-01, que entra por `EventoComunitarioPublicado`. */
  estaCancelada(id: string): Promise<boolean> {
    return this.integracion.estaCancelada(id);
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

function esEstadoCancelado(estado: unknown): boolean {
  return typeof estado === 'string' && ESTADOS_CANCELADA.has(estado.toUpperCase());
}

function esIdValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= LARGO_MAXIMO_ID;
}

/** null si falta el id, la ubicacion o una fecha valida, o si la capacidad no es un entero. */
function leerActividad(data: Record<string, unknown>): ActividadLeida | null {
  const { actividadId, titulo } = data;
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
