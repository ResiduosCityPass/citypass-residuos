import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { distanciaMetros } from '../../../shared/domain/geo';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { INTEGRACION_REPOSITORY, IntegracionRepository } from '../domain/integracion.repository';

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
 *
 * Espacios publica `ActividadCreada` y, si la actividad es masiva, Residuos:
 *   - la guarda con sus contenedores cercanos, para mostrar la zona en el mapa;
 *   - agenda la escuadrilla: desde la hora de fin y durante
 *     `INTEGRACION_HORAS_ZONA_EVENTO`, esos contenedores entran a la ruta que
 *     genera CU-08 aunque no esten criticos. Reusa el refuerzo de CU-INT-01.
 *
 * Lee los campos del contrato del squad (E1 en plan-squad-3.md), que es como
 * Espacios lo publica en el bus. Tiene su propio corte de capacidad, aparte del
 * cupo del refuerzo de CU-INT-01.
 *
 * Un evento mal formado se ignora y queda en el log, sin responder 400: un 400
 * hace que el bus lo reintente para siempre.
 */
@Injectable()
export class ActividadesMasivasService {
  private readonly logger = new Logger(ActividadesMasivasService.name);

  private readonly radioMetros: number;
  private readonly capacidadMasiva: number;
  private readonly horasZonaEvento: number;

  constructor(
    @Inject(INTEGRACION_REPOSITORY)
    private readonly integracion: IntegracionRepository,
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    config: ConfigService,
  ) {
    this.radioMetros = Number(config.get('INTEGRACION_RADIO_METROS', 300));
    this.capacidadMasiva = Number(config.get('INTEGRACION_CAPACIDAD_MASIVA', 1000));
    this.horasZonaEvento = Number(config.get('INTEGRACION_HORAS_ZONA_EVENTO', 6));
  }

  async registrar(data: Record<string, unknown>): Promise<void> {
    const actividad = leerActividad(data);

    if (!actividad) {
      this.logger.warn(`ActividadCreada ignorada, mal formada: ${JSON.stringify(data)}`);
      return;
    }
    if (actividad.cancelada || actividad.capacidad < this.capacidadMasiva) {
      return;
    }

    const activos = await this.contenedores.listar({ soloActivos: true });
    const contenedorIds = activos
      .filter((c) => distanciaMetros(actividad.punto, c) <= this.radioMetros)
      .map((c) => c.id);

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

    if (contenedorIds.length > 0) {
      await this.integracion.guardarRefuerzo({
        // Prefijo propio: el id de Espacios podria coincidir con el de un
        // EventoComunitarioPublicado y pisaria el refuerzo de CU-INT-01.
        eventoId: `act-${actividad.actividadId}`,
        zona: null,
        contenedorIds,
        desde: actividad.fin,
        hasta: new Date(actividad.fin.getTime() + this.horasZonaEvento * 3_600_000),
      });
    }
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

/** null si falta el id, la ubicacion o una fecha valida. */
function leerActividad(data: Record<string, unknown>): ActividadLeida | null {
  const { actividadId, titulo, capacidad, estado, ubicacion } = data;
  const { lat, lng } = (ubicacion ?? {}) as Record<string, unknown>;
  const inicio = leerFecha(data.fechaHoraInicio);
  const fin = leerFecha(data.fechaHoraFinalizacion);

  if (
    typeof actividadId !== 'string' ||
    actividadId.length === 0 ||
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !inicio ||
    !fin
  ) {
    return null;
  }

  return {
    actividadId,
    titulo: typeof titulo === 'string' ? titulo : null,
    capacidad: Number(capacidad ?? 0),
    punto: { lat, lng },
    inicio,
    fin,
    // En el nucleo siempre llega PROGRAMADA; el contrato deja lugar a CANCELADA.
    cancelada: estado === 'CANCELADA',
  };
}

/** Las fechas llegan en milisegundos (timestamp-millis de Avro). */
function leerFecha(valor: unknown): Date | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? new Date(valor) : null;
}
