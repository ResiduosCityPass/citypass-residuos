import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  ) {
    this.deposito = {
      lat: Number(config.get('DEPOSITO_LAT', DEPOSITO_DEFAULT.lat)),
      lng: Number(config.get('DEPOSITO_LNG', DEPOSITO_DEFAULT.lng)),
    };
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

      // Valida que el chofer exista y siga activo. Sin esto, un id equivocado
      // asignaba la ruta con exito y el chofer no la veia nunca.
      const chofer = await this.choferes.obtenerActivo(dto.choferId);

      ruta.choferId = chofer.id;
      ruta.estado = EstadoRuta.ASIGNADA;
      ruta.asignadaEn = new Date();
      await this.rutas.guardar(ruta);

      // Recien ahora el camion queda tomado: hasta la confirmacion era una
      // propuesta que nadie se comprometio a ejecutar.
      const camion = await this.flota.obtener(ruta.camionId);
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
   * estan comprometidos en otra ruta viva.
   */
  private async buscarCandidatos(
    tipoResiduo: TipoResiduo,
    zonaId?: string,
  ): Promise<CandidatoRuteo[]> {
    const [contenedores, yaRuteados, zonas] = await Promise.all([
      this.contenedores.listar({
        estado: EstadoContenedor.CRITICO,
        tipoResiduo,
        zonaId,
        soloActivos: true,
      }),
      this.rutas.contenedoresEnRutasVivas(),
      this.zonas.listar(),
    ]);

    const comprometidos = new Set(yaRuteados);
    const bloqueadas = new Set(zonas.filter((z) => z.bloqueada).map((z) => z.id));

    return contenedores
      .filter((c) => !comprometidos.has(c.id) && !bloqueadas.has(c.zonaId))
      .map((c) => ({
        contenedorId: c.id,
        lat: c.lat,
        lng: c.lng,
        litrosOcupados: litrosOcupados(c.capacidadLitros, c.nivelLlenadoPct),
      }));
  }
}
