import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { EdaTokenService } from '../../../shared/events/eda/eda-token.service';
import { EdaGatewayClient } from '../../../shared/events/eda/eda-gateway.client';
import { RecepcionEdaService } from '../application/recepcion-eda.service';
import {
  CRITICIDAD_CONFIRMADA,
  CRITICIDAD_FINALIZADA,
} from '../application/dto/criticidad-climatica.dto';
import { esTopicDe, SIMULACROS_EDA, simulacroEdaHabilitado } from '../application/simulacro-eda';
@Injectable()
export class EdaClimaConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EdaClimaConsumer.name);
  private consumer?: Consumer;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private state: 'DESHABILITADO' | 'CONECTANDO' | 'CONECTADO' | 'ERROR' = 'DESHABILITADO';
  private topics: string[] = [];
  private lastError: string | null = null;
  private lastEventAt: string | null = null;
  private pendingTestTypes: string[] = [];
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: EdaTokenService,
    private readonly gateway: EdaGatewayClient,
    private readonly recepcion: RecepcionEdaService,
  ) {}
  estado() {
    return {
      estado: this.state,
      topicos: this.topics,
      ultimoError: this.lastError,
      ultimoEventoEn: this.lastEventAt,
      simulacroHabilitado: simulacroEdaHabilitado(this.config),
      simulacrosPendientesRegistro: [...this.pendingTestTypes],
    };
  }
  onApplicationBootstrap() {
    if (this.config.get<string>('EDA_CONSUMER_ENABLED', 'false') === 'true') void this.iniciar();
  }
  async iniciar(): Promise<void> {
    this.state = 'CONECTANDO';
    try {
      const catalog = await this.gateway.listarTipos();
      const mapping = new Map<string, string>();
      const subscriptions = [CRITICIDAD_CONFIRMADA, CRITICIDAD_FINALIZADA].map((fqn) => ({
        fqn,
        tipo: fqn,
      }));
      this.pendingTestTypes = simulacroEdaHabilitado(this.config)
        ? SIMULACROS_EDA.filter(
            (s) => !catalog.some((t) => t.fqn === s.fqn && esTopicDe(t.topic, s.fqn)),
          ).map((s) => s.fqn)
        : [];
      // Los tipos de prueba son opcionales: no deben interrumpir los eventos reales.
      if (simulacroEdaHabilitado(this.config) && this.pendingTestTypes.length === 0)
        subscriptions.push(...SIMULACROS_EDA);
      for (const { fqn, tipo } of subscriptions) {
        const current = catalog.find((t) => t.fqn === fqn);
        if (!current || !esTopicDe(current.topic, fqn))
          throw new Error(`EDA no tiene registrado ${fqn}`);
        mapping.set(current.topic, tipo);
      }
      if (this.stopped) return;
      const namespace = this.config.get<string>('EDA_NAMESPACE', 'com.citypass.residuos');
      const kafka = new Kafka({
        clientId: 'citypass-residuos-clima',
        brokers: this.config
          .getOrThrow<string>('EDA_KAFKA_BROKERS')
          .split(',')
          .map((b) => b.trim()),
        ssl: this.config.get<string>('EDA_KAFKA_SSL', 'true') === 'true',
        logLevel: logLevel.NOTHING,
        sasl: {
          mechanism: 'oauthbearer',
          oauthBearerProvider: async () => ({ value: await this.tokens.obtener() }),
        },
        retry: { retries: 5 },
      });
      const consumer = kafka.consumer({
        groupId: this.config.get<string>('EDA_KAFKA_GROUP_ID', `${namespace}.residuos-clima-v1`),
        allowAutoTopicCreation: false,
        retry: { restartOnFailure: async () => !this.stopped },
      });
      this.consumer = consumer;
      const registry = new SchemaRegistry({
        host: this.config.getOrThrow<string>('EDA_GATEWAY_URL'),
      });
      consumer.on(consumer.events.CRASH, () => {
        this.state = 'ERROR';
        this.lastError = 'El consumidor se reiniciara sin confirmar el mensaje fallido.';
      });
      consumer.on(consumer.events.GROUP_JOIN, () => {
        this.state = 'CONECTADO';
      });
      await consumer.connect();
      if (this.stopped) {
        await consumer.disconnect();
        return;
      }
      this.topics = [...mapping.keys()];
      await consumer.subscribe({
        topics: this.topics,
        fromBeginning: this.config.get<string>('EDA_KAFKA_FROM_BEGINNING', 'true') === 'true',
      });
      await consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const data = message.value;
            if (!data || data.length < 5 || data[0] !== 0)
              throw new Error('Mensaje sin formato Confluent Avro');
            const envelope: unknown = await registry.decode(data);
            await this.recepcion.procesar(
              mapping.get(topic)!,
              topic,
              data.readUInt32BE(1),
              envelope,
            );
            await consumer.commitOffsets([
              { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
            ]);
            this.lastEventAt = new Date().toISOString();
            this.lastError = null;
            this.state = 'CONECTADO';
          } catch (error) {
            this.fallar(error);
            throw error;
          }
        },
      });
      this.state = 'CONECTADO';
      this.lastError = null;
    } catch (error) {
      this.fallar(error);
      await this.consumer?.disconnect().catch(() => undefined);
      if (!this.stopped) {
        this.timer = setTimeout(() => void this.iniciar(), 30000);
        this.timer.unref();
      }
    }
  }
  private fallar(error: unknown) {
    this.state = 'ERROR';
    this.lastError = (error instanceof Error ? error.message : 'Fallo del consumidor EDA').slice(
      0,
      300,
    );
    this.logger.warn(this.lastError);
  }
  async onApplicationShutdown() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.consumer?.disconnect();
  }
}
