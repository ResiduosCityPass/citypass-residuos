import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEvent } from '../../domain/domain-event';
import { EventPublisher } from '../event-publisher';
import { TRANSPORTE_EVENTOS } from '../transporte-eventos';
import { OUTBOX_REPOSITORY, OutboxRepository } from './outbox.repository';

export const INTERVALO_DEFAULT_MS = 5_000;
export const LOTE_DEFAULT = 50;
export const MAX_INTENTOS_DEFAULT = 5;
export const BACKOFF_BASE_MS = 2_000;

/**
 * Vacia la tabla outbox contra el transporte real.
 *
 * Corre en intervalo en vez de reaccionar a cada insert a proposito: si el
 * broker esta caido, un disparo por evento reintentaria en caliente y en vano.
 * El intervalo, con backoff exponencial por evento, deja que el broker se
 * recupere sin que nadie lo coordine.
 *
 * Tras `MAX_INTENTOS` el evento pasa a FALLIDO y deja de reintentarse: es la
 * dead letter que menciona el contrato de eventos. Queda en la tabla para
 * inspeccion, no se borra.
 */
@Injectable()
export class DespachadorOutbox implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DespachadorOutbox.name);
  private temporizador: NodeJS.Timeout | null = null;
  private despachando = false;

  private readonly intervaloMs: number;
  private readonly lote: number;
  private readonly maxIntentos: number;

  constructor(
    @Inject(OUTBOX_REPOSITORY)
    private readonly outbox: OutboxRepository,
    @Inject(TRANSPORTE_EVENTOS)
    private readonly transporte: EventPublisher,
    config: ConfigService,
  ) {
    this.intervaloMs = Number(config.get('OUTBOX_INTERVALO_MS', INTERVALO_DEFAULT_MS));
    this.lote = Number(config.get('OUTBOX_LOTE', LOTE_DEFAULT));
    this.maxIntentos = Number(config.get('OUTBOX_MAX_INTENTOS', MAX_INTENTOS_DEFAULT));
  }

  onModuleInit(): void {
    // En los tests el despachador se llama a mano: un temporizador de fondo
    // dejaria el proceso vivo y volveria los tests dependientes del reloj.
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.temporizador = setInterval(() => void this.despachar(), this.intervaloMs);
    this.temporizador.unref();
  }

  onApplicationShutdown(): void {
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }

  /**
   * Publica los pendientes vencidos. Devuelve cuantos salieron.
   *
   * No corre dos veces en paralelo: si un lote tarda mas que el intervalo, el
   * siguiente disparo se saltea en vez de acumular publicaciones duplicadas.
   */
  async despachar(): Promise<number> {
    if (this.despachando) {
      return 0;
    }

    this.despachando = true;

    try {
      const pendientes = await this.outbox.tomarPendientes(this.lote);
      let publicados = 0;

      for (const pendiente of pendientes) {
        try {
          await this.transporte.publish(pendiente.sobre as unknown as DomainEvent);
          await this.outbox.marcarPublicado(pendiente.eventId);
          publicados++;
        } catch (error) {
          await this.registrarIntentoFallido(pendiente.eventId, pendiente.intentos, error);
        }
      }

      return publicados;
    } finally {
      this.despachando = false;
    }
  }

  private async registrarIntentoFallido(
    eventId: string,
    intentosPrevios: number,
    error: unknown,
  ): Promise<void> {
    const motivo = error instanceof Error ? error.message : String(error);
    const intentos = intentosPrevios + 1;

    if (intentos >= this.maxIntentos) {
      this.logger.error(
        `Evento ${eventId} agoto ${this.maxIntentos} intentos y pasa a FALLIDO: ${motivo}`,
      );
      await this.outbox.marcarFallido(eventId, motivo);

      return;
    }

    const esperaMs = BACKOFF_BASE_MS * 2 ** intentosPrevios;
    this.logger.warn(
      `Evento ${eventId} fallo (intento ${intentos}/${this.maxIntentos}), ` +
        `reintenta en ${esperaMs / 1000}s: ${motivo}`,
    );

    await this.outbox.registrarFallo(eventId, motivo, new Date(Date.now() + esperaMs));
  }
}
