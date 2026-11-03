import { ConfigService } from '@nestjs/config';
import { Type, Schema } from 'avsc';
import { EdaGatewayClient } from './eda-gateway.client';
import { EdaTokenService } from './eda-token.service';
import { EdaEventPublisher } from './eda-event.publisher';
import { buildEvent, EventTypes } from '../../domain/domain-event';
import { CONTRATOS_EDA, publicacionEda, registroEda } from './eda-contracts';

describe('Publicacion HTTP al gateway EDA', () => {
  it.each(Object.entries(CONTRATOS_EDA))(
    'el contrato %s produce data valida en Avro',
    (type, contract) => {
      const schema = Type.forSchema({ type: 'record', ...registroEda(contract) } as Schema);
      const event = {
        ...buildEvent(
          EventTypes.SERVICIO_AFECTADO,
          schema.random() as unknown as Record<string, unknown>,
        ),
        eventType: type,
      };
      const { data } = publicacionEda(event, 'com.citypass.residuos');
      expect(schema.isValid(data)).toBe(true);
    },
  );
  const tokens = { obtener: jest.fn() };
  let client: EdaGatewayClient;
  let fetchMock: jest.SpyInstance;
  const response = (status = 202, body: unknown = {}) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
  beforeEach(() => {
    jest.resetAllMocks();
    tokens.obtener.mockResolvedValueOnce('service-token').mockResolvedValue('new-token');
    client = new EdaGatewayClient(
      new ConfigService({ EDA_GATEWAY_URL: 'https://gateway.example/api/v1/' }),
      tokens as unknown as EdaTokenService,
    );
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response());
  });
  afterEach(() => jest.restoreAllMocks());
  it('publica campos de negocio y el ID local estable, sin fabricar metadata del bus', async () => {
    const event = buildEvent(EventTypes.SERVICIO_AFECTADO, {
      inundacionId: 'f1',
      zonaIds: ['z1'],
      estado: 'ACTIVA',
      alertaId: 'a1',
      actorSub: 'u1',
    });
    const publisher = new EdaEventPublisher(new ConfigService(), client);
    await publisher.publish(event);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://gateway.example/api/v1/event-types/com.citypass.residuos.ServicioAfectado/events',
    );
    expect(JSON.parse(init.body)).toEqual({
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      correlationId: null,
      ...event.payload,
    });
    expect(init.headers.Authorization).toBe('Bearer service-token');
    await publisher.publish(event);
    expect(fetchMock.mock.calls[1][1].body).toBe(init.body);
  });
  it('reintenta una sola vez el token vencido; propaga errores para conservar el outbox', async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response());
    await client.request('/event-types');
    expect(tokens.obtener).toHaveBeenLastCalledWith('service-token');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
    fetchMock.mockResolvedValueOnce(response(429));
    await expect(client.request('/event-types')).rejects.toThrow('HTTP 429');
  });
  it('lista el catalogo, soporta 204 y rechaza tipos sin contrato', async () => {
    fetchMock.mockResolvedValueOnce(response(200, []));
    await expect(client.listarTipos()).resolves.toEqual([]);
    fetchMock.mockResolvedValueOnce(response(204));
    await expect(client.request('/unused')).resolves.toBeUndefined();
    expect(() =>
      publicacionEda(
        { ...buildEvent(EventTypes.SERVICIO_AFECTADO, {}), eventType: 'desconocido' },
        'com.citypass.residuos',
      ),
    ).toThrow('Sin contrato');
    expect(Object.values(CONTRATOS_EDA).map(registroEda)).toHaveLength(
      Object.keys(EventTypes).length,
    );
  });
});
