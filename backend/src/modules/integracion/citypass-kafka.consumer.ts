import { EstadoRecepcionBus } from '../../shared/events/estado-recepcion-bus';
import {
  SIMULACROS_EDA,
  esTopicDe,
  simulacroEdaHabilitado,
} from '../contingencias/application/simulacro-eda';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import { GatewayTransporte } from '../../shared/events/gateway/gateway.transporte';
import { IntegracionService, SobreGateway } from './application/integracion.service';

/**
 * Todos los topicos de los modulos que Residuos escucha: los tipos del switch de
 * `IntegracionService.procesar` y los que todavia no maneja. Un tipo sin manejo
 * se ignora ahi, asi que no hace falta mantener una lista aparte.
 *
 * ponytail: kafkajs resuelve la expresion contra los topicos que existen al
 * conectarse. Un tipo que se registre despues entra en el proximo arranque (en
 * Render free es seguido, porque la API se duerme).
 */
const TOPICOS = /^com\.citypass\.(reclamos|emergencias|espacios)\./;

/**
 * Consumidor del bus de CityPass+ por Kafka, la via que recomienda EDA.
 *
 * Llega el mismo sobre que por el webhook y va al mismo `procesar`: la
 * deduplicacion por `eventId` hace que un evento que llega por los dos lados se
 * procese una sola vez. El webhook queda igual, porque en Render free es lo que
 * despierta la API: dormida, este consumidor no lee nada.
 *
 * Solo arranca si esta `KAFKA_BROKERS`.
 */
@Injectable()
export class CitypassKafkaConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CitypassKafkaConsumer.name);
  private readonly registry: SchemaRegistry;
  private consumer: Consumer | null = null;
  private stopped = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly integracion: IntegracionService,
    private readonly gateway: GatewayTransporte,
    private readonly config: ConfigService,
    private readonly estadoBus: EstadoRecepcionBus,
  ) {
    const urlGateway = config
      .get<string>('GATEWAY_URL', 'http://localhost:8080')
      .replace(/\/$/, '');
    // El gateway responde /schemas/ids/{id} igual que un Schema Registry.
    this.registry = new SchemaRegistry({ host: `${urlGateway}/api/v1` });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.stopped) return;
    const brokers = this.config.get<string>('KAFKA_BROKERS', '');

    if (!brokers) {
      return;
    }

    this.estadoBus.actualizar({
      estado: 'CONECTANDO',
      simulacroHabilitado: simulacroEdaHabilitado(this.config),
    });
    const namespace = this.config.get<string>('GATEWAY_NAMESPACE', 'com.citypass.residuos');

    const kafka = new Kafka({
      clientId: this.config.get<string>('GATEWAY_CLIENT_ID', 'svc-residuos'),
      brokers: brokers.split(',').map((b) => b.trim()),
      ssl: this.config.get<string>('KAFKA_SSL', 'true') === 'true',
      sasl: {
        mechanism: 'oauthbearer',
        oauthBearerProvider: async () => ({ value: await this.gateway.obtenerToken() }),
      },
      logLevel: logLevel.WARN,
    });

    // El broker solo deja usar grupos con el prefijo del namespace.
    this.consumer = kafka.consumer({
      groupId: this.config.get<string>('KAFKA_GROUP_ID', `${namespace}.api`),
      allowAutoTopicCreation: false,
    });
    this.consumer.on(this.consumer.events.CRASH, () =>
      this.estadoBus.actualizar({
        estado: 'ERROR',
        ultimoError: 'El consumidor reintentara el mensaje pendiente.',
      }),
    );
    this.consumer.on(this.consumer.events.GROUP_JOIN, () =>
      this.estadoBus.actualizar({ estado: 'CONECTADO' }),
    );

    // Sin await: conectarse reintenta varios segundos y frenaria el arranque. Si
    // el bus no responde, la API arranca igual y el webhook sigue andando.
    void this.conectar(this.consumer).catch(async () => {
      this.estadoBus.actualizar({
        estado: 'ERROR',
        ultimoError: 'No se pudo conectar al bus; se reintentara.',
      });
      this.logger.error('No se pudo conectar a Kafka; se reintentara en 30 segundos');
      await this.consumer?.disconnect().catch(() => undefined);
      if (!this.stopped) {
        this.timer = setTimeout(() => void this.onApplicationBootstrap(), 30000);
        this.timer.unref();
      }
    });
  }

  private async conectar(consumer: Consumer): Promise<void> {
    const topics: Array<string | RegExp> = [TOPICOS];
    if (simulacroEdaHabilitado(this.config)) {
      const catalogo = await this.gateway.listarTipos();
      const pendientes = SIMULACROS_EDA.filter(
        (s) => !catalogo.some((t) => t.fqn === s.fqn && esTopicDe(t.topic, s.fqn)),
      );
      this.estadoBus.actualizar({ simulacrosPendientesRegistro: pendientes.map((s) => s.fqn) });
      if (!pendientes.length)
        topics.push(
          ...catalogo
            .filter((t) => SIMULACROS_EDA.some((s) => s.fqn === t.fqn))
            .map((t) => t.topic),
        );
    }
    if (this.stopped) return;
    await consumer.connect();
    if (this.stopped) {
      await consumer.disconnect();
      return;
    }
    // No se reproducen emergencias viejas al incorporar el consumidor unificado.
    await consumer.subscribe({ topics, fromBeginning: false });
    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        try {
          await this.alRecibir(message.value, topic);
          await consumer.commitOffsets([
            { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
          ]);
          this.estadoBus.actualizar({
            estado: 'CONECTADO',
            ultimoError: null,
            ultimoEventoEn: new Date().toISOString(),
          });
        } catch (error) {
          this.estadoBus.actualizar({
            estado: 'ERROR',
            ultimoError: 'Entrega pendiente: se reintentara sin confirmar el offset.',
          });
          throw error;
        }
      },
    });
    this.estadoBus.actualizar({
      estado: 'CONECTADO',
      ultimoError: null,
      topicos: topics.map(String),
    });
    this.logger.log('Consumiendo del bus por Kafka');
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.consumer?.disconnect();
  }

  /**
   * kafkajs commitea el offset solo si esto termina bien. Un mensaje o un evento
   * mal formado no se arregla reintentando y trabaria la particion, asi que se
   * loguea y se sigue. Cualquier otro error (el registry o la base caidos) se
   * relanza para que se reintente.
   */
  async alRecibir(valor: Buffer | null, topic?: string): Promise<void> {
    const sobre = await this.decodificar(valor);

    if (sobre === null) {
      return;
    }

    try {
      await this.integracion.procesar(
        sobre as SobreGateway,
        topic && valor ? { topic, schemaId: valor.readUInt32BE(1) } : undefined,
      );
    } catch (error) {
      if (!(error instanceof BadRequestException) && !(error instanceof ConflictException)) {
        throw error;
      }
      // Error y no warning: si todos caen aca, el sobre de Kafka no es el esperado.
      this.logger.error(`Evento de Kafka descartado: ${JSON.stringify(error.getResponse())}`);
    }
  }

  /** null si el mensaje no se puede leer. Tira si el registry no responde. */
  private async decodificar(valor: Buffer | null): Promise<unknown> {
    // Formato Confluent: [0x00][id del esquema, 4 bytes][Avro].
    if (!valor || valor.length < 5 || valor[0] !== 0) {
      this.logger.error('Mensaje de Kafka descartado: no tiene el formato de Confluent');
      return null;
    }

    // Lo que falle aca es la conexion y se reintenta, salvo un esquema que el
    // gateway no conoce: ese no va a aparecer. Despues queda en cache.
    try {
      await this.registry.getSchema(valor.readInt32BE(1));
    } catch (error) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }
      this.logger.error(`Mensaje de Kafka descartado: esquema ${valor.readInt32BE(1)} desconocido`);
      return null;
    }

    try {
      return await this.registry.decode(valor);
    } catch (error) {
      this.logger.error(`Mensaje de Kafka descartado: ${(error as Error).message}`);
      return null;
    }
  }
}
