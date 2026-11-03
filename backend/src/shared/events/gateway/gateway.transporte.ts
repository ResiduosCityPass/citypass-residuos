import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEvent } from '../../domain/domain-event';
import { EventPublisher } from '../event-publisher';
import { sinBarrasFinales } from './url-gateway';
import { traducirAGateway } from './traductor-gateway';

/** Margen para renovar el token antes de que venza (los tokens duran 15 minutos). */
const MARGEN_RENOVACION_MS = 30_000;

/** El gateway rechazo el evento por contrato: reintentarlo daria lo mismo. */
export class EventoRechazadoPorGateway extends Error {}

/**
 * Driver `platform` de TRANSPORTE_EVENTOS (ADR-003): el bus del Squad 1.
 *
 * Publica el DespachadorOutbox; el catalogo y Kafka comparten su token.
 * Si publish() tira, el despachador reintenta
 * con backoff y al agotar intentos deja el evento FALLIDO en la tabla, igual que
 * con cualquier otro transporte. El dominio no se entera.
 */
@Injectable()
export class GatewayTransporte implements EventPublisher {
  private readonly logger = new Logger(GatewayTransporte.name);

  private readonly urlGateway: string;
  private readonly urlToken: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly namespace: string;

  private token: string | null = null;
  private tokenVenceEn = 0;
  private solicitando?: Promise<string>;

  constructor(config: ConfigService) {
    this.urlGateway = sinBarrasFinales(config.get<string>('GATEWAY_URL', 'http://localhost:8080'));
    this.urlToken = config.get<string>('GATEWAY_TOKEN_URL', 'http://localhost:8083/oauth/token');
    this.clientId = config.get<string>('GATEWAY_CLIENT_ID', 'svc-residuos');
    this.clientSecret = config.get<string>('GATEWAY_CLIENT_SECRET', '');
    this.namespace = config.get<string>('GATEWAY_NAMESPACE', 'com.citypass.residuos');
  }

  async publish<T extends Record<string, unknown>>(evento: DomainEvent<T>): Promise<void> {
    const traducido = traducirAGateway(evento as DomainEvent);

    if (!traducido) {
      // Sin consumidores fuera del modulo: se da por publicado.
      return;
    }

    const fqn = `${this.namespace}.${traducido.tipo}`;
    const respuesta = await this.enviarAutenticado(
      `/event-types/${encodeURIComponent(fqn)}/events`,
      'POST',
      traducido.datos,
    );

    if (respuesta.status === 400 || respuesta.status === 404) {
      const detalle = await respuesta.text();
      this.logger.error(`El gateway rechazo ${fqn} (${evento.eventId}): ${detalle}`);
      throw new EventoRechazadoPorGateway(`${fqn}: ${detalle}`);
    }

    if (!respuesta.ok) {
      throw new Error(`El gateway respondio ${respuesta.status} al publicar ${fqn}`);
    }
  }

  /** Catalogo y CLI usan el mismo token que outbox y Kafka. */
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await this.enviarAutenticado(path, method, body);
    if (!response.ok) throw new Error(`El gateway respondio ${response.status}`);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  listarTipos() {
    return this.request<Array<{ fqn: string; topic: string }>>('/event-types');
  }

  private async enviarAutenticado(path: string, method: string, body?: unknown): Promise<Response> {
    const enviar = async () =>
      fetch(`${this.urlGateway}/api/v1${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await this.obtenerToken()}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    let respuesta = await enviar();
    if (respuesta.status === 401) {
      this.token = null;
      respuesta = await enviar();
    }
    return respuesta;
  }

  /** Token de servicio del Login. Lo reusa el consumidor de Kafka para su SASL. */
  async obtenerToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenVenceEn - MARGEN_RENOVACION_MS) {
      return this.token;
    }

    this.solicitando ??= this.solicitarToken().finally(() => {
      this.solicitando = undefined;
    });
    return this.solicitando;
  }

  private async solicitarToken(): Promise<string> {
    const credenciales = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const respuesta = await fetch(this.urlToken, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credenciales}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!respuesta.ok) {
      throw new Error(`El emisor de tokens respondio ${respuesta.status}`);
    }

    const cuerpo = (await respuesta.json()) as { access_token: string; expires_in?: number };
    if (
      typeof cuerpo.access_token !== 'string' ||
      !cuerpo.access_token ||
      (cuerpo.expires_in !== undefined &&
        (!Number.isFinite(cuerpo.expires_in) || cuerpo.expires_in <= 0))
    ) {
      throw new Error('El emisor devolvio un token de servicio invalido');
    }
    this.token = cuerpo.access_token;
    this.tokenVenceEn = Date.now() + (cuerpo.expires_in ?? 900) * 1000;

    return this.token;
  }
}
