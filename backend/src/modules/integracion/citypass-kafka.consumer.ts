import {
  BadRequestException,
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

  constructor(
    private readonly integracion: IntegracionService,
    private readonly gateway: GatewayTransporte,
    private readonly config: ConfigService,
  ) {
    const urlGateway = config.get<string>('GATEWAY_URL', 'http://localhost:8080');
    // El gateway responde /schemas/ids/{id} igual que un Schema Registry.
    this.registry = new SchemaRegistry({ host: `${urlGateway}/api/v1` });
  }

  async onApplicationBootstrap(): Promise<void> {
    const brokers = this.config.get<string>('KAFKA_BROKERS', '');

    if (!brokers) {
      return;
    }

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
    this.consumer = kafka.consumer({ groupId: `${namespace}.api` });

    // Sin await: conectarse reintenta varios segundos y frenaria el arranque. Si
    // el bus no responde, la API arranca igual y el webhook sigue andando.
    this.conectar(this.consumer).catch((error: Error) =>
      this.logger.error(`No se pudo conectar a Kafka: ${error.message}`),
    );
  }

  private async conectar(consumer: Consumer): Promise<void> {
    await consumer.connect();
    // Desde lo ultimo: el historial traeria emergencias viejas que bloquearian zonas.
    await consumer.subscribe({ topics: [TOPICOS], fromBeginning: false });
    await consumer.run({
      eachMessage: ({ message }) => this.alRecibir(message.value),
    });
    this.logger.log('Consumiendo del bus por Kafka');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer?.disconnect();
  }

  /**
   * kafkajs commitea el offset solo si esto termina bien. Un mensaje o un evento
   * mal formado no se arregla reintentando y trabaria la particion, asi que se
   * loguea y se sigue. Cualquier otro error (el registry o la base caidos) se
   * relanza para que se reintente.
   */
  async alRecibir(valor: Buffer | null): Promise<void> {
    const sobre = await this.decodificar(valor);

    if (sobre === null) {
      return;
    }

    try {
      await this.integracion.procesar(sobre as SobreGateway);
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
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
