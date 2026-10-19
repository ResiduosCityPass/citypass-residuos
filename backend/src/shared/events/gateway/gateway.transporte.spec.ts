import { ConfigService } from '@nestjs/config';
import { EventTypes, buildEvent } from '../../domain/domain-event';
import { EventoRechazadoPorGateway, GatewayTransporte } from './gateway.transporte';

const respuesta = (status: number, cuerpo: unknown = {}): Response =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('GatewayTransporte (CU-INT-01)', () => {
  const fetchOriginal = global.fetch;
  let fetchMock: jest.Mock;
  let transporte: GatewayTransporte;

  const alerta = buildEvent(EventTypes.CONTENEDOR_CRITICO, {
    alertaId: 'al-1',
    contenedorId: 'CT-1',
    zonaId: 'Centro',
    nivelLlenado: 90,
    ubicacion: { lat: -34.6, lng: -58.4 },
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    transporte = new GatewayTransporte(
      new ConfigService({
        GATEWAY_URL: 'http://gateway',
        GATEWAY_TOKEN_URL: 'http://auth/oauth/token',
        GATEWAY_CLIENT_ID: 'svc-residuos',
        GATEWAY_CLIENT_SECRET: 'secreto',
      }),
    );
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('pide un token una sola vez y publica en el tipo del namespace', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/oauth/token')
        ? respuesta(200, { access_token: 'tok-1', expires_in: 900 })
        : respuesta(202),
    );

    await transporte.publish(alerta);
    await transporte.publish(alerta);

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls.filter((u) => u.endsWith('/oauth/token'))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith('/events'))).toEqual([
      'http://gateway/api/v1/event-types/com.citypass.residuos.AlertaGenerada/events',
      'http://gateway/api/v1/event-types/com.citypass.residuos.AlertaGenerada/events',
    ]);
    const [, opciones] = fetchMock.mock.calls[1];
    expect(opciones.headers.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(opciones.body).tipoAlerta).toBe('SATURACION');
  });

  it('un rechazo por contrato se informa con su propio error', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/oauth/token')
        ? respuesta(200, { access_token: 'tok', expires_in: 900 })
        : respuesta(400, { detail: 'falta alertaId' }),
    );

    await expect(transporte.publish(alerta)).rejects.toBeInstanceOf(EventoRechazadoPorGateway);
  });

  it('con el gateway caido tira error para que el despachador reintente', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/oauth/token')
        ? respuesta(200, { access_token: 'tok', expires_in: 900 })
        : respuesta(503),
    );

    await expect(transporte.publish(alerta)).rejects.toThrow('503');
  });

  it('los eventos sin traduccion no llaman al gateway', async () => {
    await transporte.publish(buildEvent(EventTypes.RUTA_GENERADA, { rutaId: 'rt-1' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
