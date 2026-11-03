import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { canonicalJson } from '../../../shared/events/eda/canonical-json';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { EntregaEda } from '../domain/entrega-eda.entity';
import { ContingenciasService } from './contingencias.service';
import { CriticidadClimaticaService } from './criticidad-climatica.service';
import { CRITICIDAD_CONFIRMADA, CRITICIDAD_FINALIZADA } from './dto/criticidad-climatica.dto';
import {
  ACTOR_SIMULACRO,
  esTopicDe,
  PREFIJO_SIMULACRO,
  SIMULACROS_EDA,
  simulacroEdaHabilitado,
} from './simulacro-eda';
@Injectable()
export class RecepcionEdaService {
  constructor(
    @InjectRepository(EntregaEda) private readonly fallback: Repository<EntregaEda>,
    private readonly tx: ContextoTransaccional,
    private readonly contingencias: ContingenciasService,
    private readonly clima: CriticidadClimaticaService,
    private readonly config: ConfigService,
  ) {}
  /** Solo recibe del consumidor autenticado, nunca de HTTP anonimo. */
  async procesar(tipo: string, topic: string, schemaId: number, entrada: unknown) {
    const event = entrada as { metadata?: Record<string, unknown>; data?: unknown } | null;
    const meta = event?.metadata;
    const simulacro = SIMULACROS_EDA.find((s) => esTopicDe(topic, s.fqn));
    if (
      ![CRITICIDAD_CONFIRMADA, CRITICIDAD_FINALIZADA].includes(tipo) ||
      (simulacro ? simulacro.tipo !== tipo : !esTopicDe(topic, tipo)) ||
      !meta ||
      typeof meta !== 'object' ||
      !isUUID(meta.eventId, '4') ||
      typeof meta.eventType !== 'string' ||
      ![tipo, topic, simulacro?.fqn].includes(meta.eventType as string) ||
      meta.schemaId !== schemaId ||
      !Number.isSafeInteger(meta.receivedAt) ||
      typeof meta.source !== 'string' ||
      !meta.source ||
      typeof meta.payloadHash !== 'string' ||
      !/^[a-f\d]{64}$/i.test(meta.payloadHash) ||
      !event?.data ||
      typeof event.data !== 'object' ||
      Array.isArray(event.data)
    ) {
      throw new BadRequestException(
        'Sobre EDA invalido o no corresponde al topico/schema recibido',
      );
    }
    if (simulacro) {
      const payload = event.data as Record<string, unknown>;
      if (
        !simulacroEdaHabilitado(this.config) ||
        meta.source !== this.config.get<string>('EDA_CLIENT_ID', 'grupo6') ||
        typeof payload.alertaId !== 'string' ||
        !payload.alertaId.startsWith(PREFIJO_SIMULACRO) ||
        payload.actorSub !== ACTOR_SIMULACRO
      ) {
        throw new BadRequestException(
          'Simulacro EDA deshabilitado o sin identidad y marcas de prueba de Residuos',
        );
      }
    }
    const eventId = (meta.eventId as string).toLowerCase();
    const huella = createHash('sha256').update(canonicalJson(event)).digest('hex');
    return this.tx.ejecutar(async () => {
      await this.contingencias.bloquearOperacion();
      const repo = this.tx.managerActual()?.getRepository(EntregaEda) ?? this.fallback;
      const existing = await repo.findOneBy({ eventId });
      if (existing) {
        if (existing.huella !== huella)
          throw new ConflictException('El eventId EDA ya tiene otro contenido');
        return { duplicado: true };
      }
      const result = simulacro
        ? await this.clima.recibir(tipo, event.data, 'eda-simulacro')
        : await this.clima.recibir(tipo, event.data);
      await repo.save({ eventId, huella, tipo, metadata: meta, procesadaEn: new Date() });
      return { duplicado: result.duplicado };
    });
  }
}
