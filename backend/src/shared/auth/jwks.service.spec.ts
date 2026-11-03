import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { JwksService } from './jwks.service';

describe('JwksService', () => {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', use: 'sig', alg: 'RS256' };
  let service: JwksService;
  let fetchMock: jest.SpyInstance;
  const response = (keys: unknown[] = [key]) => ({ ok: true, json: async () => ({ keys }) });

  beforeEach(() => {
    service = new JwksService(new ConfigService({ JWT_JWKS_URL: 'https://idp.example/jwks' }));
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response() as Response);
  });
  afterEach(() => jest.restoreAllMocks());

  it('descarga una vez para requests simultaneos y conserva la clave en cache', async () => {
    const [a, b] = await Promise.all([service.clave('key-1'), service.clave('key-1')]);
    expect(a).toContain('BEGIN PUBLIC KEY');
    expect(a).toBe(b);
    await service.clave('key-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].href).toBe('https://idp.example/jwks');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
  });

  it.each([undefined, '', '../../url', 'x'.repeat(201)])(
    'rechaza kid invalido %s sin consultar la red',
    async (kid) => {
      await expect(service.clave(kid)).rejects.toThrow('kid');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('limita las consultas por kid desconocido y permite rotar la clave', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await service.clave('key-1');
    await expect(service.clave('otro')).rejects.toThrow('clave vigente');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    jest.spyOn(Date, 'now').mockReturnValue(now + 31000);
    fetchMock.mockResolvedValue(response([{ ...key, kid: 'otro' }]) as Response);
    await expect(service.clave('otro')).resolves.toContain('PUBLIC KEY');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rechaza JWKS caido y no reutiliza claves vencidas', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await service.clave('key-1');
    jest.spyOn(Date, 'now').mockReturnValue(now + 300001);
    fetchMock.mockResolvedValue({ ok: false } as Response);
    await expect(service.clave('key-1')).rejects.toThrow('consultar');
    await expect(service.clave('key-1')).rejects.toThrow('clave vigente');
  });

  it.each([
    { keys: [] },
    { keys: [{ ...key, alg: 'HS256' }] },
    { keys: [{ ...key, use: 'enc' }] },
    { keys: [{ ...key, d: 'private' }] },
  ])('rechaza documentos sin claves de firma aceptables', async ({ keys }) => {
    fetchMock.mockResolvedValue(response(keys) as Response);
    await expect(service.clave('key-1')).rejects.toThrow('sin claves');
  });

  it('no permite configuraciones HTTP o credenciales embebidas', async () => {
    service = new JwksService(new ConfigService({ JWT_JWKS_URL: 'http://idp.example/jwks' }));
    await expect(service.clave('key-1')).rejects.toThrow('HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
