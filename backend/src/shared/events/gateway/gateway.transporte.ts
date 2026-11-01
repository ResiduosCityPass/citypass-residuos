import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEvent } from '../../domain/domain-event';
import { EventPublisher } from '../event-publisher';
import { traducirAGateway } from './traductor-gateway';

/** Margen para renovar el token antes de que venza (los tokens duran 15 minutos). */
const MARGEN_RENOVACION_MS = 30_000;

/** El gateway rechazo el evento por contrato: reintentarlo daria lo mismo. */
export class EventoRechazadoPorGateway extends Error {}

/**
 * Driver `platform` de TRANSPORTE_EVENTOS (ADR-003): el bus del Squad 1.
 *
 * Lo usa solo el DespachadorOutbox. Si publish() tira, el despachador reintenta
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

  constructor(config: ConfigService) {
    this.urlGateway = config.get<string>('GATEWAY_URL', 'http://localhost:8080');
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
    let respuesta = await this.enviar(fqn, traducido.datos);

    if (respuesta.status === 401) {
      // El token pudo vencer entre que lo pedimos y lo usamos.
      this.token = null;
      respuesta = await this.enviar(fqn, traducido.datos);
    }

    if (respuesta.status === 400 || respuesta.status === 404) {
      const detalle = await respuesta.text();
      this.logger.error(`El gateway rechazo ${fqn} (${evento.eventId}): ${detalle}`);
      throw new EventoRechazadoPorGateway(`${fqn}: ${detalle}`);
    }

    if (!respuesta.ok) {
      throw new Error(`El gateway respondio ${respuesta.status} al publicar ${fqn}`);
    }
  }

  private async enviar(fqn: string, datos: Record<string, unknown>): Promise<Response> {
    return fetch(`${this.urlGateway}/api/v1/event-types/${fqn}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await this.obtenerToken()}`,
      },
      body: JSON.stringify(datos),
    });
  }

  /** Token de servicio del Login. Lo reusa el consumidor de Kafka para su SASL. */
  async obtenerToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenVenceEn - MARGEN_RENOVACION_MS) {
      return this.token;
    }

    const credenciales = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const respuesta = await fetch(this.urlToken, {
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
    this.token = cuerpo.access_token;
    this.tokenVenceEn = Date.now() + (cuerpo.expires_in ?? 900) * 1000;

    return this.token;
  }
}
