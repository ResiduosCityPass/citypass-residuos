import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { randomUUID } from 'crypto';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import {
  ALERTA_CLIMATICA_REPOSITORY,
  AlertaClimaticaExterna,
  AlertaClimaticaRepository,
} from '../domain/alerta-climatica.entity';
import { ContingenciasService } from './contingencias.service';
import {
  CRITICIDAD_CONFIRMADA,
  CRITICIDAD_FINALIZADA,
  CriticidadConfirmadaDto,
  CriticidadFinalizadaDto,
  ResolverCriticidadDto,
  SimularCriticidadDto,
} from './dto/criticidad-climatica.dto';
import { EVENTO_FIN, EVENTO_INICIO } from './dto/evento-inundacion.dto';
import { canonicalJson as canonico } from '../../../shared/events/gateway/canonical-json';

@Injectable()
export class CriticidadClimaticaService {
  constructor(
    @Inject(ALERTA_CLIMATICA_REPOSITORY) private readonly repo: AlertaClimaticaRepository,
    private readonly contingencias: ContingenciasService,
    private readonly tx: ContextoTransaccional,
  ) {}
  async listar() {
    return {
      simuladorHabilitado: this.contingencias.simuladorHabilitado(),
      alertas: await this.repo.listar(),
    };
  }
  simular(dto: SimularCriticidadDto) {
    if (!this.contingencias.simuladorHabilitado())
      throw new NotFoundException('Simulador deshabilitado');
    return this.recibir(dto.tipo, dto.payload, 'simulador');
  }

  /** Payload del productor, recibido por el consumidor autenticado de EDA o el simulador. */
  async recibir(tipo: string, payload: unknown, origen: AlertaClimaticaExterna['origen'] = 'eda') {
    const confirmada = tipo === CRITICIDAD_CONFIRMADA;
    if (!confirmada && tipo !== CRITICIDAD_FINALIZADA)
      throw new BadRequestException('Tipo de criticidad climatica no soportado');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Se esperaba un payload JSON');
    }
    const dto = confirmada
      ? plainToInstance(CriticidadConfirmadaDto, payload)
      : plainToInstance(CriticidadFinalizadaDto, payload);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length) {
      throw new BadRequestException({
        code: 'CRITICIDAD_INVALIDA',
        message: 'El payload no cumple el contrato de Espacios Publicos.',
      });
    }
    if (dto instanceof CriticidadConfirmadaDto && dto.vigenciaHasta < dto.vigenciaDesde) {
      throw new BadRequestException('vigenciaHasta no puede ser anterior a vigenciaDesde');
    }
    // Normaliza UUID para que reentregas con mayusculas sean equivalentes.
    if (isUUID(dto.alertaId)) dto.alertaId = dto.alertaId.toLowerCase();
    return this.tx.ejecutar(async () => {
      await this.contingencias.bloquearOperacion();
      const alerta =
        (await this.repo.buscar(dto.alertaId)) ??
        Object.assign(new AlertaClimaticaExterna(), {
          alertaId: dto.alertaId,
          confirmacion: null,
          finalizacion: null,
          contingenciaId: null,
          decision: 'PENDIENTE_REVISION',
          motivo: null,
          revisadoPor: null,
          revisadaEn: null,
          origen,
          recibidaEn: new Date(),
        });
      if ((alerta.origen === 'eda-simulacro') !== (origen === 'eda-simulacro'))
        throw new ConflictException('No se mezclan etapas de un simulacro EDA con otras fuentes');
      const anterior = confirmada ? alerta.confirmacion : alerta.finalizacion;
      if (anterior) {
        if (this.payloadCanonico(tipo, anterior) !== this.payloadCanonico(tipo, dto))
          throw new ConflictException({
            code: 'ALERTA_CLIMATICA_CONFLICTO',
            message:
              'La misma alerta y etapa ya tienen otro contenido. No hay un contrato de actualizaciones acordado.',
          });
        return { alerta, duplicado: true };
      }
      if (dto instanceof CriticidadConfirmadaDto) alerta.confirmacion = dto;
      else alerta.finalizacion = dto;
      if (!confirmada && alerta.contingenciaId) {
        const c = await this.contingencias.obtener(alerta.contingenciaId);
        await this.aplicar(
          alerta,
          EVENTO_FIN,
          c.zonas!.map((z) => z.zonaId),
        );
      }
      await this.repo.guardar(alerta);
      return { alerta, duplicado: false };
    });
  }

  async resolver(id: string, dto: ResolverCriticidadDto, actor: string) {
    return this.tx.ejecutar(async () => {
      await this.contingencias.bloquearOperacion();
      const alerta = await this.repo.buscar(id);
      if (!alerta) throw new NotFoundException('No existe la alerta climatica');
      if (!alerta.confirmacion)
        throw new ConflictException('Falta recibir la confirmacion de Espacios Publicos');
      if (alerta.decision !== 'PENDIENTE_REVISION')
        throw new ConflictException('La alerta ya fue revisada');
      alerta.revisadoPor = actor;
      if (dto.accion === 'SUSPENDER') {
        if (!dto.zonaIds?.length)
          throw new BadRequestException('Selecciona al menos una zona afectada');
        if (alerta.confirmacion.vigenciaDesde > Date.now())
          throw new ConflictException('La alerta aun no esta vigente');
        alerta.contingenciaId = randomUUID();
        await this.aplicar(alerta, EVENTO_INICIO, dto.zonaIds);
        if (alerta.finalizacion) await this.aplicar(alerta, EVENTO_FIN, dto.zonaIds);
      } else if (dto.zonaIds?.length)
        throw new BadRequestException('Una alerta sin afectacion no debe tener zonas');
      alerta.decision = dto.accion;
      alerta.motivo = dto.motivo;
      alerta.revisadoPor = actor;
      alerta.revisadaEn = new Date();
      return this.repo.guardar(alerta);
    });
  }

  private aplicar(alerta: AlertaClimaticaExterna, tipo: string, zonaIds: string[]) {
    const inicio = tipo === EVENTO_INICIO;
    const confirmacion = alerta.confirmacion!;
    return this.contingencias.procesarEvento({
      eventId: randomUUID(),
      eventType: tipo,
      source: 'espaciospublicos-service',
      version: 1,
      occurredAt: new Date(
        inicio ? confirmacion.vigenciaDesde : alerta.finalizacion!.finalizadaEn,
      ).toISOString(),
      correlationId: alerta.contingenciaId,
      payload: {
        inundacionId: alerta.contingenciaId,
        revision: inicio ? 1 : 2,
        descripcion: `${alerta.origen === 'eda-simulacro' ? 'SIMULACRO · ' : ''}Suspension por inundacion · ${confirmacion.fenomeno} (${confirmacion.nivelCriticidad})`,
        zonaIds,
        alertaId: alerta.alertaId,
        actorSub: inicio
          ? (alerta.revisadoPor ?? confirmacion.actorSub)
          : alerta.finalizacion!.actorSub,
      },
    });
  }

  private payloadCanonico(
    tipo: string,
    payload: CriticidadConfirmadaDto | CriticidadFinalizadaDto,
  ) {
    if (tipo !== CRITICIDAD_CONFIRMADA) return canonico(payload);
    // Los defaults de Avro pueden aparecer al reentregar un payload de un schema anterior.
    const inicio = payload as CriticidadConfirmadaDto;
    return canonico({
      ...inicio,
      barrios: inicio.barrios ?? [],
      temperaturaMinC: inicio.temperaturaMinC ?? null,
      temperaturaMaxC: inicio.temperaturaMaxC ?? null,
    });
  }
}
