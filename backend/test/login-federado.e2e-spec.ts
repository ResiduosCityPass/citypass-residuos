import * as request from 'supertest';
import { generateKeyPairSync } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { crearAppDePrueba, AppDePrueba } from './helpers/app-de-prueba';

describe('Autenticacion federada y permisos del delegado (e2e)', () => {
  let ctx: AppDePrueba;
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'qa-idp',
    alg: 'RS256',
    use: 'sig',
  };
  const settings = ['AUTH_MODE', 'JWT_ISSUER', 'JWT_JWKS_URL', 'JWT_OPERATOR_GROUPS'];
  const previous = Object.fromEntries(settings.map((k) => [k, process.env[k]]));
  const sign = (patch = {}) =>
    new JwtService().sign(
      {
        sub: 'U000res',
        preferred_username: 'delegado-res',
        module: 'residuos',
        token_use: 'human',
        ver: 1,
        groups: ['delegados'],
        ...patch,
      },
      {
        privateKey,
        algorithm: 'RS256',
        keyid: 'qa-idp',
        issuer: 'https://idp.citypass.local',
        audience: 'citypass-residuos-api',
        expiresIn: 900,
      },
    );
  beforeAll(async () => {
    process.env.AUTH_MODE = 'federated';
    process.env.JWT_ISSUER = 'https://idp.citypass.local';
    process.env.JWT_JWKS_URL = 'https://idp.example/.well-known/jwks.json';
    process.env.JWT_OPERATOR_GROUPS = 'operador,delegados';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) } as Response);
    ctx = await crearAppDePrueba((builder) => {
      builder.overrideProvider(ConfigService).useValue(new ConfigService({ ...process.env }));
    });
  });
  beforeEach(async () => {
    await ctx.limpiar();
  });
  afterAll(async () => {
    await ctx?.cerrar();
    jest.restoreAllMocks();
    for (const k of settings) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  });
  it('acepta aud escalar real y deja operar al delegado con rol OPERADOR', async () => {
    const auth = { Authorization: `Bearer ${sign()}` };
    const http = request(ctx.app.getHttpServer());
    expect((await http.get('/api/v1/auth/sesion').set(auth).expect(200)).body).toEqual({
      sub: 'U000res',
      nombre: 'delegado-res',
      rol: 'OPERADOR',
    });
    await http.get('/api/v1/contingencias/clima').set(auth).expect(200);
    await http
      .post('/api/v1/camiones')
      .set(auth)
      .send({ patente: 'AB123CD', capacidadLitros: 10000, tipoResiduoHabilitado: 'COMUN' })
      .expect(403);
  });
  it.each([{ module: 'reclamos' }, { token_use: 'service' }])(
    'rechaza identidad incompatible: %j',
    async (patch) => {
      await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/sesion')
        .set('Authorization', `Bearer ${sign(patch)}`)
        .expect(401);
    },
  );
  it('no acepta humanos HS256 cuando se habilita federacion', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/v1/auth/sesion')
      .set('Authorization', `Bearer ${ctx.token()}`)
      .expect(401);
  });
});
