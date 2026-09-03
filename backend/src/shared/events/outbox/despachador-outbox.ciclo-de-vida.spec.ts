import { ConfigService } from '@nestjs/config';
import { EventPublisher } from '../event-publisher';
import { DespachadorOutbox } from './despachador-outbox';
import { OutboxRepository } from './outbox.repository';

describe('DespachadorOutbox · ciclo de vida', () => {
  let outbox: jest.Mocked<OutboxRepository>;
  let transporte: jest.Mocked<EventPublisher>;
  let despachador: DespachadorOutbox;
  const entornoOriginal = process.env.NODE_ENV;

  beforeEach(() => {
    jest.useFakeTimers();
    outbox = {
      encolar: jest.fn(),
      tomarPendientes: jest.fn().mockResolvedValue([]),
      marcarPublicado: jest.fn(),
      registrarFallo: jest.fn(),
      marcarFallido: jest.fn(),
    };
    transporte = { publish: jest.fn() };
    despachador = new DespachadorOutbox(
      outbox,
      transporte,
      new ConfigService({ OUTBOX_INTERVALO_MS: 1000 }),
    );
  });

  afterEach(() => {
    despachador.onApplicationShutdown();
    jest.useRealTimers();
    process.env.NODE_ENV = entornoOriginal;
  });

  it('no arranca el temporizador durante los tests', () => {
    // Un intervalo de fondo dejaria el proceso vivo y volveria los tests
    // dependientes del reloj. En los tests el despachador se llama a mano.
    process.env.NODE_ENV = 'test';

    despachador.onModuleInit();
    jest.advanceTimersByTime(5000);

    expect(outbox.tomarPendientes).not.toHaveBeenCalled();
  });

  it('despacha en intervalo fuera de los tests', async () => {
    process.env.NODE_ENV = 'development';

    despachador.onModuleInit();
    // La variante async vacia las microtareas entre disparos. Con la sincrona,
    // el despacho anterior queda pendiente y la guarda de concurrencia saltea
    // el siguiente: correcto en produccion, pero cuenta uno solo aca.
    await jest.advanceTimersByTimeAsync(3000);

    expect(outbox.tomarPendientes).toHaveBeenCalledTimes(3);
  });

  it('deja de despachar al apagar la aplicacion', async () => {
    process.env.NODE_ENV = 'development';
    despachador.onModuleInit();
    await jest.advanceTimersByTimeAsync(1000);

    despachador.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(5000);

    expect(outbox.tomarPendientes).toHaveBeenCalledTimes(1);
  });

  it('apagar dos veces no rompe', () => {
    process.env.NODE_ENV = 'development';
    despachador.onModuleInit();

    despachador.onApplicationShutdown();

    expect(() => despachador.onApplicationShutdown()).not.toThrow();
  });
});
