import { ConfigService } from '@nestjs/config';
import { EventPublisher } from '../event-publisher';
import { BACKOFF_BASE_MS, DespachadorOutbox } from './despachador-outbox';
import { EstadoEventoPendiente, EventoPendiente } from './evento-pendiente.entity';
import { OutboxRepository } from './outbox.repository';

const pendiente = (parcial: Partial<EventoPendiente> = {}): EventoPendiente =>
  ({
    eventId: 'ev-1',
    eventType: 'residuos.contenedor.critico',
    sobre: { eventId: 'ev-1', payload: { contenedorId: 'CT-0421' } },
    estado: EstadoEventoPendiente.PENDIENTE,
    intentos: 0,
    ultimoError: null,
    proximoIntentoEn: new Date(),
    publicadoEn: null,
    ...parcial,
  }) as EventoPendiente;

describe('DespachadorOutbox', () => {
  let outbox: jest.Mocked<OutboxRepository>;
  let transporte: jest.Mocked<EventPublisher>;
  let despachador: DespachadorOutbox;

  const construir = (config: Record<string, unknown> = {}) =>
    new DespachadorOutbox(outbox, transporte, new ConfigService(config));

  beforeEach(() => {
    outbox = {
      encolar: jest.fn(),
      tomarPendientes: jest.fn().mockResolvedValue([]),
      marcarPublicado: jest.fn(),
      registrarFallo: jest.fn(),
      marcarFallido: jest.fn(),
    };
    transporte = { publish: jest.fn() };
    despachador = construir();
  });

  describe('camino feliz', () => {
    it('publica los pendientes y los marca', async () => {
      outbox.tomarPendientes.mockResolvedValue([pendiente()]);

      const publicados = await despachador.despachar();

      expect(transporte.publish).toHaveBeenCalledWith(pendiente().sobre);
      expect(outbox.marcarPublicado).toHaveBeenCalledWith('ev-1');
      expect(publicados).toBe(1);
    });

    it('manda el sobre completo, no solo el payload', async () => {
      // El consumidor deduplica por eventId: si se mandara solo el payload,
      // perderia el unico dato que le permite hacerlo.
      outbox.tomarPendientes.mockResolvedValue([pendiente()]);

      await despachador.despachar();

      expect(transporte.publish).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'ev-1' }));
    });

    it('no hace nada si no hay pendientes', async () => {
      await expect(despachador.despachar()).resolves.toBe(0);
      expect(transporte.publish).not.toHaveBeenCalled();
    });

    it('pide un lote acotado, no la tabla entera', async () => {
      await despachador.despachar();

      expect(outbox.tomarPendientes).toHaveBeenCalledWith(50);
    });
  });

  describe('reintentos', () => {
    it('reprograma el evento cuando el transporte falla', async () => {
      outbox.tomarPendientes.mockResolvedValue([pendiente()]);
      transporte.publish.mockRejectedValue(new Error('broker caido'));

      const publicados = await despachador.despachar();

      expect(publicados).toBe(0);
      expect(outbox.marcarPublicado).not.toHaveBeenCalled();
      expect(outbox.registrarFallo).toHaveBeenCalledWith('ev-1', 'broker caido', expect.any(Date));
    });

    it('espera cada vez mas entre reintentos', async () => {
      const esperaDe = async (intentos: number) => {
        outbox.registrarFallo.mockClear();
        outbox.tomarPendientes.mockResolvedValue([pendiente({ intentos })]);
        transporte.publish.mockRejectedValue(new Error('x'));

        const antes = Date.now();
        await despachador.despachar();
        const proximo = outbox.registrarFallo.mock.calls[0][2] as Date;

        return proximo.getTime() - antes;
      };

      const primera = await esperaDe(0);
      const segunda = await esperaDe(1);
      const tercera = await esperaDe(2);

      expect(primera).toBeGreaterThanOrEqual(BACKOFF_BASE_MS - 50);
      expect(segunda).toBeGreaterThan(primera);
      expect(tercera).toBeGreaterThan(segunda);
    });

    it('un evento que falla no frena a los que siguen', async () => {
      outbox.tomarPendientes.mockResolvedValue([
        pendiente({ eventId: 'ev-1' }),
        pendiente({ eventId: 'ev-2' }),
      ]);
      transporte.publish
        .mockRejectedValueOnce(new Error('falla puntual'))
        .mockResolvedValueOnce(undefined);

      const publicados = await despachador.despachar();

      expect(publicados).toBe(1);
      expect(outbox.marcarPublicado).toHaveBeenCalledWith('ev-2');
    });
  });

  describe('dead letter', () => {
    it('marca FALLIDO al agotar los intentos', async () => {
      outbox.tomarPendientes.mockResolvedValue([pendiente({ intentos: 4 })]);
      transporte.publish.mockRejectedValue(new Error('sigue caido'));

      await despachador.despachar();

      expect(outbox.marcarFallido).toHaveBeenCalledWith('ev-1', 'sigue caido');
      expect(outbox.registrarFallo).not.toHaveBeenCalled();
    });

    it('respeta el maximo de intentos configurado', async () => {
      despachador = construir({ OUTBOX_MAX_INTENTOS: 2 });
      outbox.tomarPendientes.mockResolvedValue([pendiente({ intentos: 1 })]);
      transporte.publish.mockRejectedValue(new Error('x'));

      await despachador.despachar();

      expect(outbox.marcarFallido).toHaveBeenCalled();
    });
  });

  describe('concurrencia', () => {
    it('no despacha dos veces en paralelo', async () => {
      // Si un lote tarda mas que el intervalo, el disparo siguiente se saltea
      // en vez de publicar todo dos veces.
      let resolver: (() => void) | undefined;
      outbox.tomarPendientes.mockImplementation(() => new Promise((r) => (resolver = () => r([]))));

      const primera = despachador.despachar();
      const segunda = await despachador.despachar();

      expect(segunda).toBe(0);
      expect(outbox.tomarPendientes).toHaveBeenCalledTimes(1);

      resolver?.();
      await primera;
    });

    it('vuelve a despachar despues de terminar', async () => {
      await despachador.despachar();
      await despachador.despachar();

      expect(outbox.tomarPendientes).toHaveBeenCalledTimes(2);
    });

    it('se libera aunque el lote falle', async () => {
      outbox.tomarPendientes.mockRejectedValueOnce(new Error('base caida'));

      await expect(despachador.despachar()).rejects.toThrow('base caida');

      outbox.tomarPendientes.mockResolvedValue([]);
      await expect(despachador.despachar()).resolves.toBe(0);
    });
  });
});
