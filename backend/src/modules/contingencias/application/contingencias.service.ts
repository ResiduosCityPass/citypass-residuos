import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import { buildEvent, EventTypes } from '../../../shared/domain/domain-event';
import { EstadoParada, EstadoRuta } from '../../../shared/domain/enums';
import { EVENT_PUBLISHER, EventPublisher } from '../../../shared/events/event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { Ruta } from '../../rutas/domain/ruta.entity';
import { Zona } from '../../zonas/domain/zona.entity';
import { Contingencia, EstadoContingencia } from '../domain/contingencia.entity';
import { CONTINGENCIA_REPOSITORY, ContingenciaRepository } from '../domain/contingencia.repository';
import {
  EventoInundacionDto,
  EVENTO_FIN,
  EVENTO_INICIO,
  SimularInundacionDto,
} from './dto/evento-inundacion.dto';

@Injectable()
export class ContingenciasService {
  constructor(
    @Inject(CONTINGENCIA_REPOSITORY) private readonly repo: ContingenciaRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventos: EventPublisher,
    private readonly transaccion: ContextoTransaccional,
    private readonly config: ConfigService,
  ) {}

  simuladorHabilitado(): boolean {
    return (
      this.config.get<string>('NODE_ENV') !== 'production' &&
      this.config.get<string>('CLIMA_SIMULADOR_HABILITADO', 'true') === 'true'
    );
  }

  async listar() {
    return {
      simuladorHabilitado: this.simuladorHabilitado(),
      contingencias: await this.repo.listar(),
    };
  }

  async obtener(id: string): Promise<Contingencia> {
    const contingencia = await this.repo.buscar(id);
    if (!contingencia)
      throw new NotFoundException({
        code: 'CONTINGENCIA_NO_ENCONTRADA',
        message: 'No existe la inundacion indicada.',
      });
    return contingencia;
  }

  private exigirSimulador(): void {
    if (!this.simuladorHabilitado())
      throw new NotFoundException({
        code: 'SIMULADOR_DESHABILITADO',
        message: 'El simulador de inundaciones esta deshabilitado.',
      });
  }

  simularInicio(dto: SimularInundacionDto) {
    this.exigirSimulador();
    const id = randomUUID();
    return this.procesarEvento({
      eventId: randomUUID(),
      eventType: EVENTO_INICIO,
      occurredAt: new Date().toISOString(),
      source: 'espaciospublicos-service',
      version: 1,
      correlationId: id,
      payload: { ...dto, inundacionId: id, revision: 1 },
    });
  }

  async simularFinalizacion(id: string) {
    this.exigirSimulador();
    const c = await this.obtener(id);
    return this.procesarEvento({
      eventId: randomUUID(),
      eventType: EVENTO_FIN,
      occurredAt: new Date().toISOString(),
      source: 'espaciospublicos-service',
      version: 1,
      correlationId: c.correlationId,
      payload: {
        inundacionId: id,
        revision: c.revision + 1,
        descripcion: c.descripcion,
        zonaIds: c.zonas!.map((z) => z.zonaId),
      },
    });
  }

  /** Punto de entrada comun al simulador y al futuro consumidor EDA. Valida tambien fuera de HTTP. */
  async procesarEvento(entrada: unknown) {
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
      throw new BadRequestException({
        code: 'EVENTO_CLIMATICO_INVALIDO',
        message: 'Se esperaba un evento de inundacion v1.',
      });
    }
    const evento = plainToInstance(EventoInundacionDto, entrada);
    if (
      !evento ||
      validateSync(evento, { whitelist: true, forbidNonWhitelisted: true }).length > 0
    ) {
      throw new BadRequestException({
        code: 'EVENTO_CLIMATICO_INVALIDO',
        message: 'El evento no cumple el contrato de inundaciones v1.',
      });
    }
    const p = evento.payload;
    p.zonaIds = p.zonaIds.map((id) => id.toLowerCase()).sort();
    const huella = createHash('sha256')
      .update(
        JSON.stringify([
          evento.eventType,
          evento.occurredAt,
          evento.source,
          evento.version,
          evento.correlationId,
          p.inundacionId,
          p.revision,
          p.descripcion,
          p.zonaIds,
          p.alertaId,
          p.actorSub,
        ]),
      )
      .digest('hex');

    return this.transaccion.ejecutar(async () => {
      await this.bloquearOperacion();
      const recibido = await this.repo.eventoProcesado(evento.eventId);
      if (recibido) {
        if (recibido.huella !== huella)
          throw new ConflictException({
            code: 'EVENTO_ID_REUTILIZADO',
            message: 'El eventId ya fue recibido con otro contenido.',
          });
        return {
          contingencia: await this.obtener(p.inundacionId),
          duplicado: true,
          ignorado: false,
        };
      }
      let c = await this.repo.buscar(p.inundacionId);
      if (c && p.revision <= c.revision) {
        await this.repo.registrarEvento(evento.eventId, huella);
        return { contingencia: c, duplicado: false, ignorado: true };
      }
      if ((await this.repo.zonasExistentes(p.zonaIds)) !== p.zonaIds.length) {
        throw new BadRequestException({
          code: 'EVENTO_ZONA_DESCONOCIDA',
          message: 'Hay zonas que no existen en Residuos. Revisa el mapeo de zonas.',
        });
      }
      if (
        c &&
        c
          .zonas!.map((z) => z.zonaId)
          .sort()
          .join() !== p.zonaIds.join()
      ) {
        throw new ConflictException({
          code: 'CONTINGENCIA_ZONAS_DISTINTAS',
          message: 'Las zonas de una inundacion son inmutables en el contrato v1.',
        });
      }
      // Una finalizacion anticipada tambien deja una restriccion hasta revision del operador.
      // El inicio retrasado (revision menor) no puede reactivar la inundacion.
      const nueva = !c;
      const finaliza =
        evento.eventType === EVENTO_FIN && (!c || c.estado === EstadoContingencia.ACTIVA);
      if (!c) {
        c = await this.repo.guardar({
          id: p.inundacionId,
          descripcion: p.descripcion,
          revision: p.revision,
          estado: EstadoContingencia.ACTIVA,
          iniciadaEn: new Date(evento.occurredAt),
          finalizadaEn: null,
          recuperacionEn: null,
          recuperadaEn: null,
          correlationId: evento.correlationId,
          alertaId: p.alertaId ?? null,
        });
        await this.repo.registrarZonas(c.id, p.zonaIds);
        await this.repo.registrarImpactos(c.id, p.zonaIds);
      }
      if (evento.eventType === EVENTO_INICIO && c.estado !== EstadoContingencia.ACTIVA) {
        throw new ConflictException({
          code: 'CONTINGENCIA_YA_FINALIZADA',
          message: 'Una inundacion finalizada no se puede reabrir. Usa un nuevo identificador.',
        });
      }
      c.revision = p.revision;
      c.descripcion = p.descripcion;
      if (evento.eventType === EVENTO_FIN && c.estado === EstadoContingencia.ACTIVA) {
        c.estado = EstadoContingencia.PENDIENTE_RECUPERACION;
        c.finalizadaEn = new Date(evento.occurredAt);
      }
      await this.repo.guardar(c);
      await this.repo.registrarEvento(evento.eventId, huella);
      if (nueva)
        await this.publicar(c, EventTypes.SERVICIO_AFECTADO, {
          zonaIds: p.zonaIds,
          actorSub: p.actorSub ?? null,
        });
      if (finaliza) {
        await this.publicar(c, EventTypes.RECUPERACION_PENDIENTE, {
          zonaIds: p.zonaIds,
          actorSub: p.actorSub ?? null,
        });
      }
      return { contingencia: await this.obtener(c.id), duplicado: false, ignorado: false };
    });
  }

  async habilitarRecuperacion(id: string, actorSub?: string): Promise<Contingencia> {
    return this.transaccion.ejecutar(async () => {
      await this.bloquearOperacion();
      const c = await this.obtener(id);
      if (c.estado === EstadoContingencia.ACTIVA)
        throw new ConflictException({
          code: 'INUNDACION_ACTIVA',
          message: 'Primero debe finalizar la inundacion.',
        });
      if (c.estado !== EstadoContingencia.PENDIENTE_RECUPERACION) return c;
      // Incluye lo acumulado hasta habilitar la recuperacion, no solo lo que habia al inicio.
      await this.repo.registrarImpactos(
        id,
        c.zonas!.map((z) => z.zonaId),
      );
      c.estado = EstadoContingencia.EN_RECUPERACION;
      c.recuperacionEn = new Date();
      await this.repo.guardar(c);
      await this.publicar(c, EventTypes.RECUPERACION_HABILITADA, { actorSub: actorSub ?? null });
      await this.cerrarSiRecuperada(c, actorSub);
      return this.obtener(id);
    });
  }

  bloquearOperacion() {
    return this.repo.bloquearOperacion();
  }
  restricciones() {
    return this.repo.restricciones();
  }
  pendientesDeRecuperacion() {
    return this.repo.pendientesDeRecuperacion();
  }
  zonaTieneHistorial(zonaId: string) {
    return this.repo.zonaTieneHistorial(zonaId);
  }

  async exigirZonaHabilitada(zonaId: string): Promise<void> {
    const restricciones = (await this.restricciones()).filter((r) => r.zonaId === zonaId);
    if (restricciones.length)
      throw new ConflictException({
        code: 'PARADA_SUSPENDIDA_INUNDACION',
        message: 'La recoleccion esta suspendida por inundacion o pendiente de habilitacion.',
        contingenciaIds: restricciones.map((r) => r.contingenciaId),
      });
    if ((await this.repo.zonasBloqueadasManualmente()).includes(zonaId)) {
      throw new ConflictException({
        code: 'ZONA_BLOQUEADA',
        message:
          'La zona conserva un bloqueo manual. El operador debe revisarlo antes de recolectar.',
      });
    }
  }

  async decorarZonas(zonas: Zona[]): Promise<Zona[]> {
    const restricciones = await this.restricciones();
    return zonas.map((z) =>
      Object.assign(z, { restriccionesInundacion: restricciones.filter((r) => r.zonaId === z.id) }),
    );
  }

  async decorarRutas(rutas: Ruta[]): Promise<Ruta[]> {
    if (rutas.length === 0) return rutas;
    const vivas = rutas.filter((r) =>
      [EstadoRuta.PROPUESTA, EstadoRuta.ASIGNADA, EstadoRuta.EN_CURSO].includes(r.estado),
    );
    const [restricciones, pendientes, manuales] = await Promise.all([
      this.restricciones(),
      this.repo.paradasPendientes(vivas.map((r) => r.id)),
      this.repo.zonasBloqueadasManualmente(),
    ]);
    for (const ruta of rutas) {
      const afectadas = pendientes.filter(
        (p) => p.rutaId === ruta.id && restricciones.some((r) => r.zonaId === p.zonaId),
      );
      ruta.paradasSuspendidas = afectadas.length;
      ruta.paradasBloqueadasManualmente = pendientes.filter(
        (p) => p.rutaId === ruta.id && manuales.includes(p.zonaId),
      ).length;
      ruta.contingenciaIds = [
        ...new Set(
          restricciones
            .filter((r) => afectadas.some((p) => p.zonaId === r.zonaId))
            .map((r) => r.contingenciaId),
        ),
      ];
      for (const parada of ruta.paradas ?? []) {
        parada.bloqueoManual = pendientes.some(
          (p) => p.id === parada.id && manuales.includes(p.zonaId),
        );
        const pendiente = afectadas.find((p) => p.id === parada.id);
        parada.restriccionesInundacion =
          pendiente && parada.estado === EstadoParada.PENDIENTE
            ? restricciones.filter((r) => r.zonaId === pendiente.zonaId)
            : [];
      }
    }
    return rutas;
  }

  /** Se ejecuta en la misma transaccion del vaciado; omitir no recupera el servicio. */
  async registrarVaciado(contenedorId: string, fecha: Date, actorSub?: string): Promise<void> {
    for (const id of await this.repo.marcarVaciado(contenedorId, fecha)) {
      await this.cerrarSiRecuperada(await this.obtener(id), actorSub);
    }
  }

  private async cerrarSiRecuperada(c: Contingencia, actorSub?: string): Promise<void> {
    if ((await this.repo.contarPendientes(c.id)) !== 0) return;
    c.estado = EstadoContingencia.RECUPERADA;
    c.recuperadaEn = new Date();
    await this.repo.guardar(c);
    await this.publicar(c, EventTypes.SERVICIO_RESTABLECIDO, { actorSub: actorSub ?? null });
  }

  private publicar(
    c: Contingencia,
    tipo: (typeof EventTypes)[keyof typeof EventTypes],
    extra: Record<string, unknown>,
  ) {
    return this.eventos.publish(
      buildEvent(
        tipo,
        {
          inundacionId: c.id,
          alertaId: c.alertaId ?? null,
          actorSub: null,
          estado: c.estado,
          zonaIds: c.zonas?.map((z) => z.zonaId),
          ...extra,
        },
        { correlationId: c.alertaId ?? c.correlationId },
      ),
    );
  }
}
