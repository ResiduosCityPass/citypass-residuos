import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes, buildEvent } from '../../../shared/domain/domain-event';
import {
  EstadoCamion,
  EstadoContenedor,
  EstadoRuta,
  TipoResiduo,
} from '../../../shared/domain/enums';
import { Punto } from '../../../shared/domain/geo';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../../contenedores/domain/contenedor.repository';
import { ChoferesService } from '../../choferes/application/choferes.service';
import { FlotaService } from '../../flota/application/flota.service';
import {
  OBSTRUCCION_REPOSITORY,
  ObstruccionRepository,
  REFUERZOS_VIGENTES,
  RefuerzosVigentes,
} from '../../integracion/domain/integracion.repository';
import { ZonasService } from '../../zonas/application/zonas.service';
import { PARADA_REPOSITORY, ParadaRepository } from '../domain/parada.repository';
import { Ruta } from '../domain/ruta.entity';
import {
  AVANCE_VACIO,
  FiltroRutas,
  RUTA_REPOSITORY,
  RutaRepository,
} from '../domain/ruta.repository';
import { CandidatoRuteo, litrosOcupados, planificarRuta } from '../domain/reglas/planificador';
import { AsignarRutaDto } from './dto/asignar-ruta.dto';
import { GenerarRutaDto } from './dto/generar-ruta.dto';

/** Deposito por defecto: el Obelisco. Configurable por entorno. */
export const DEPOSITO_DEFAULT: Punto = { lat: -34.6037, lng: -58.3816 };

/** Desde donde sale y adonde vuelve cada camion. */
export function depositoConfigurado(config: ConfigService): Punto {
  return {
    lat: Number(config.get('DEPOSITO_LAT', DEPOSITO_DEFAULT.lat)),
    lng: Number(config.get('DEPOSITO_LNG', DEPOSITO_DEFAULT.lng)),
  };
}

/**
 * CU-08 y CU-09 · Generar y asignar rutas.
 *
 * Generar y asignar estan separados a proposito: la heuristica propone y una
 * persona confirma. Es lo que pide el caso de uso por si la propuesta es
 * absurda, y el unico momento en que alguien lo puede notar.
 */
@Injectable()
export class RutasService {
  private readonly deposito: Punto;

  constructor(
    @Inject(RUTA_REPOSITORY)
    private readonly rutas: RutaRepository,
    @Inject(PARADA_REPOSITORY)
    private readonly paradas: ParadaRepository,
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventos: EventPublisher,
    private readonly flota: FlotaService,
    private readonly choferes: ChoferesService,
    private readonly zonas: ZonasService,
    private readonly transaccion: ContextoTransaccional,
    config: ConfigService,
    // Opcional: sin el modulo de integracion (o en tests previos) el ruteo
    // funciona como antes, solo con contenedores criticos.
    @Optional()
    @Inject(REFUERZOS_VIGENTES)
    private readonly refuerzos?: RefuerzosVigentes,
    @Optional()
    @Inject(OBSTRUCCION_REPOSITORY)
    private readonly obstrucciones?: Pick<ObstruccionRepository, 'contenedoresObstruidos'>,
  ) {
    this.deposito = depositoConfigurado(config);
  }

  /** CU-08 · Arma una propuesta de recorrido. No toma el camion todavia. */
  async generar(dto: GenerarRutaDto): Promise<Ruta> {
    const camion = await this.flota.obtener(dto.camionId);

    if (camion.estado !== EstadoCamion.DISPONIBLE) {
      throw new ConflictException({
        message: `El camion ${camion.patente} esta en estado ${camion.estado}`,
        code: 'CAMION_NO_DISPONIBLE',
      });
    }

    const candidatos = await this.buscarCandidatos(camion.tipoResiduoHabilitado, dto.zonaId);

    if (candidatos.length === 0) {
      throw new ConflictException({
        message:
          `No hay contenedores criticos de tipo ${camion.tipoResiduoHabilitado} ` +
          `sin rutear para este camion`,
        code: 'RUTA_SIN_CONTENEDORES',
      });
    }

    const plan = planificarRuta(this.deposito, candidatos, camion.capacidadLitros);

    if (plan.paradas.length === 0) {
      throw new ConflictException({
        message:
          `Ningun contenedor critico entra en la capacidad de ${camion.capacidadLitros} litros ` +
          `del camion ${camion.patente}`,
        code: 'RUTA_SIN_CONTENEDORES',
      });
    }

    return this.transaccion.ejecutar(async () => {
      const ruta = await this.rutas.crear({
        camionId: camion.id,
        choferId: null,
        estado: EstadoRuta.PROPUESTA,
        distanciaEstimadaKm: plan.distanciaKm,
        litrosEstimados: plan.litros,
      });

      await this.paradas.crearVarias(
        plan.paradas.map((parada, indice) => ({
          rutaId: ruta.id,
          contenedorId: parada.contenedorId,
          orden: indice + 1,
        })),
      );

      await this.eventos.publish(
        buildEvent(EventTypes.RUTA_GENERADA, {
          rutaId: ruta.id,
          camionId: camion.patente,
          cantidadParadas: plan.paradas.length,
          distanciaEstimadaKm: plan.distanciaKm,
          cargaEstimadaLitros: plan.litros,
          generadaEn: new Date().toISOString(),
        }),
      );

      return this.obtener(ruta.id);
    });
  }

  /** CU-09 · Una persona confirma la propuesta y compromete el camion. */
  async asignar(id: string, dto: AsignarRutaDto): Promise<Ruta> {
    return this.transaccion.ejecutar(async () => {
      const ruta = await this.obtener(id);

      if (ruta.estado !== EstadoRuta.PROPUESTA) {
        throw new ConflictException({
          message: `La ruta ya esta en estado ${ruta.estado}`,
          code: 'RUTA_NO_PROPUESTA',
        });
      }

      // Generar no reserva el camion: una propuesta no lo toma. Asi que entre
      // generar y asignar pudo haber salido en otra ruta, o ir a mantenimiento.
      // Sin este control el mismo camion quedaba con dos rutas vivas, y cerrar
      // la primera lo liberaba con la segunda todavia en la calle.
      const camion = await this.flota.obtener(ruta.camionId);

      if (camion.estado !== EstadoCamion.DISPONIBLE) {
        throw new ConflictException({
          message: `El camion ${camion.patente} esta en estado ${camion.estado}`,
          code: 'CAMION_NO_DISPONIBLE',
        });
      }

      // Valida que el chofer exista y siga activo. Sin esto, un id equivocado
      // asignaba la ruta con exito y el chofer no la veia nunca.
      const chofer = await this.choferes.obtenerActivo(dto.choferId);

      ruta.choferId = chofer.id;
      ruta.estado = EstadoRuta.ASIGNADA;
      ruta.asignadaEn = new Date();
      await this.rutas.guardar(ruta);

      // Recien ahora el camion queda tomado: hasta la confirmacion era una
      // propuesta que nadie se comprometio a ejecutar.
      camion.estado = EstadoCamion.EN_RUTA;
      await this.flota.guardarEstado(camion);

      await this.eventos.publish(
        buildEvent(EventTypes.RUTA_ASIGNADA, {
          rutaId: ruta.id,
          camionId: camion.patente,
          choferId: chofer.legajo,
          choferNombre: chofer.nombre,
          cantidadParadas: ruta.paradas?.length ?? 0,
          asignadaEn: ruta.asignadaEn.toISOString(),
        }),
      );

      return this.obtener(id);
    });
  }

  /**
   * El listado no trae las paradas, pero si su avance: la tabla necesita
   * mostrar "2 de 3 vaciadas" y una llamada por fila para eso es un N+1.
   */
  /**
   * Descarta una propuesta que nadie va a asignar.
   *
   * Una propuesta compromete sus contenedores: ninguna otra ruta los toma
   * mientras siga viva. Sin forma de descartarla, generar una ruta que no
   * convencia dejaba esos contenedores afuera del ruteo para siempre.
   *
   * Solo desde PROPUESTA. Una ruta asignada ya tiene un chofer y un camion en la
   * calle: esa se cierra desde las paradas, no se descarta desde el escritorio.
   * El camion no se toca porque una propuesta nunca lo tomo.
   */
  async descartar(id: string): Promise<Ruta> {
    const ruta = await this.obtener(id);

    if (ruta.estado !== EstadoRuta.PROPUESTA) {
      throw new ConflictException({
        message: `La ruta esta en estado ${ruta.estado}: solo se descarta una PROPUESTA`,
        code: 'RUTA_NO_PROPUESTA',
      });
    }

    ruta.estado = EstadoRuta.CANCELADA;
    await this.rutas.guardar(ruta);

    return ruta;
  }

  async listar(filtro: FiltroRutas): Promise<Ruta[]> {
    const rutas = await this.rutas.listar(filtro);
    const avances = await this.rutas.avanceDeParadas(rutas.map((ruta) => ruta.id));

    for (const ruta of rutas) {
      ruta.avance = avances.get(ruta.id) ?? AVANCE_VACIO;
    }

    return rutas;
  }

  async obtener(id: string): Promise<Ruta> {
    const ruta = await this.rutas.buscarPorId(id);

    if (!ruta) {
      throw new NotFoundException({
        message: `No existe la ruta ${id}`,
        code: 'RUTA_NO_ENCONTRADA',
      });
    }

    return ruta;
  }

  /**
   * CU-10 · La ruta activa de quien esta autenticado.
   *
   * Recibe el `sub` de la sesion, no un id de chofer: la identidad sale del
   * token y nunca de un parametro. Resuelve primero que chofer es esa sesion.
   *
   * Devuelve null con exito en los tres casos en que no hay nada que mostrar:
   * la sesion no corresponde a ningun chofer, el chofer esta dado de baja, o no
   * tiene ruta activa. Terminar el turno no es un error, y distinguirlos en la
   * respuesta solo le diria a quien pregunta si ese `sub` existe y si sigue
   * habilitado.
   */
  async rutaActivaDeSesion(sub: string): Promise<Ruta | null> {
    const chofer = await this.choferes.buscarActivoPorUsuarioSub(sub);

    if (!chofer) {
      return null;
    }

    return this.rutas.buscarActivaDeChofer(chofer.id);
  }

  /**
   * Contenedores criticos que este camion puede levantar y que todavia no
   * estan comprometidos en otra ruta viva. Se suman los de un refuerzo vigente
   * por evento cultural (CU-INT-01) aunque no esten criticos.
   *
   * Se descartan los tapados por un auto denunciado en un reclamo (CU-INT-02),
   * aunque esten reforzados: el camion no puede llegar igual.
   */
  private async buscarCandidatos(
    tipoResiduo: TipoResiduo,
    zonaId?: string,
  ): Promise<CandidatoRuteo[]> {
    const [criticos, reforzados, yaRuteados, zonas, obstruidos] = await Promise.all([
      this.contenedores.listar({
        estado: EstadoContenedor.CRITICO,
        tipoResiduo,
        zonaId,
        soloActivos: true,
      }),
      this.contenedoresReforzados(tipoResiduo, zonaId),
      this.rutas.contenedoresEnRutasVivas(),
      this.zonas.listar(),
      this.obstrucciones?.contenedoresObstruidos(new Date()) ?? [],
    ]);

    const porId = new Map([...criticos, ...reforzados].map((c) => [c.id, c]));
    const contenedores = [...porId.values()];
    const comprometidos = new Set(yaRuteados);
    const bloqueadas = new Set(zonas.filter((z) => z.bloqueada).map((z) => z.id));
    const tapados = new Set(obstruidos);

    return contenedores
      .filter((c) => !comprometidos.has(c.id) && !bloqueadas.has(c.zonaId) && !tapados.has(c.id))
      .map((c) => ({
        contenedorId: c.id,
        lat: c.lat,
        lng: c.lng,
        litrosOcupados: litrosOcupados(c.capacidadLitros, c.nivelLlenadoPct),
      }));
  }

  /** Contenedores de los refuerzos por evento vigentes ahora, del tipo pedido. */
  private async contenedoresReforzados(tipoResiduo: TipoResiduo, zonaId?: string) {
    if (!this.refuerzos) {
      return [];
    }

    const ids = new Set(
      (await this.refuerzos.vigentes(new Date())).flatMap((r) => r.contenedorIds),
    );
    if (ids.size === 0) {
      return [];
    }

    const delTipo = await this.contenedores.listar({ tipoResiduo, zonaId, soloActivos: true });
    return delTipo.filter((c) => ids.has(c.id));
  }
}
