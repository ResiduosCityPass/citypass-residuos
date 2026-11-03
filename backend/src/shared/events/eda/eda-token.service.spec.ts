import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'crypto';
import { EdaTokenService } from './eda-token.service';

describe('Identidad de servicio EDA', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'service-key',
    use: 'sig',
    alg: 'RS256',
  };
  const jwt = new JwtService();
  const sign = (extra = {}, opts = {}) =>
    jwt.sign(
      { token_use: 'service', namespace: 'com.citypass.residuos', sub: 'grupo6', ver: 1, ...extra },
      {
        privateKey,
        algorithm: 'RS256',
        keyid: 'service-key',
        issuer: 'https://idp.citypass.local',
        audience: 'citypass',
        expiresIn: 900,
        ...opts,
      },
    );
  const response = (value: unknown, status = 200) =>
    ({ ok: status === 200, status, json: async () => value }) as Response;
  let service: EdaTokenService;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    service = new EdaTokenService(
      new ConfigService({ EDA_CLIENT_ID: 'grupo6', EDA_CLIENT_SECRET: 'test-secret' }),
    );
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) =>
        String(input).endsWith('/oauth/token')
          ? response({ access_token: sign(), expires_in: 900 })
          : response({ keys: [jwk] }),
      );
  });
  afterEach(() => jest.restoreAllMocks());
  it('pide por Basic, valida firma/namespace y comparte la renovacion concurrente', async () => {
    const [a, b] = await Promise.all([service.obtener(), service.obtener()]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await service.obtener();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('grupo6:test-secret').toString('base64')}`,
    );
    expect(init.body).toBe('grant_type=client_credentials');
    await service.obtener(a);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it.each([
    { token_use: 'human' },
    { namespace: 'com.citypass.turismo' },
    { sub: 'otro-cliente' },
    { ver: 2 },
  ])('rechaza identidad incompatible %j', async (patch) => {
    fetchMock.mockResolvedValueOnce(response({ access_token: sign(patch), expires_in: 900 }));
    await expect(service.obtener()).rejects.toThrow('no corresponde');
  });
  it.each([{ audience: 'otra-api' }, { issuer: 'otro-issuer' }, { expiresIn: -30 }])(
    'rechaza firma/claims %j',
    async (opts) => {
      fetchMock.mockResolvedValueOnce(response({ access_token: sign({}, opts), expires_in: 900 }));
      await expect(service.obtener()).rejects.toThrow();
    },
  );
  it('renueva antes de vencer y falla sin filtrar el secreto ante un 401', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await service.obtener();
    jest.spyOn(Date, 'now').mockReturnValue(now + 841000);
    await service.obtener();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mockResolvedValueOnce(response({}, 401));
    await expect(service.obtener(await service.obtener())).rejects.toThrow('HTTP 401');
  });
  it('rechaza respuestas incompletas o tokens sin RS256 y deja reintentar', async () => {
    fetchMock.mockResolvedValueOnce(response({ expires_in: 900 }));
    await expect(service.obtener()).rejects.toThrow('invalida');
    fetchMock.mockResolvedValueOnce(response({ access_token: 'malformado', expires_in: 900 }));
    await expect(service.obtener()).rejects.toThrow('RS256');
    await expect(service.obtener()).resolves.toBeTruthy();
  });
});
