import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EMISOR_CHOFERES_DEFAULT, EMISOR_TOKEN_DEFAULT } from '../../config/env.validation';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { JwksService } from '../../shared/auth/jwks.service';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { AnaliticaModule } from './analitica.module';

describe('Tablero de Analitica por HTTP con los guards reales', () => {
  let app: INestApplication;
  let fetchMock: jest.SpyInstance;
  const config = new ConfigService({
    JWT_SECRET: 'test-tablero',
    AUTH_MODE: 'local',
    NODE_ENV: 'test',
    ANALITICA_URL: 'https://analitica.example',
  });
  const jwt = new JwtService();
  const token = (groups = ['administrador'], patch = {}, issuer = EMISOR_TOKEN_DEFAULT) =>
    jwt.sign(
      {
        sub: 'usuario-prueba',
        preferred_username: 'prueba',
        module: 'residuos',
        ver: 1,
        token_use: 'human',
        groups,
        ...patch,
      },
      { secret: 'test-tablero', issuer, audience: ['citypass-residuos-api'], expiresIn: 900 },
    );
  const html = '<!doctype html><html><body>Cuadrillas afectadas por clima</body></html>';
  const get = (bearer = token(), query = '') =>
    request(app.getHttpServer())
      .get('/api/v1/metricas/tablero' + query)
      .set('Authorization', `Bearer ${bearer}`);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AnaliticaModule],
      providers: [
        Reflector,
        JwksService,
        { provide: JwtService, useValue: jwt },
        {
          provide: APP_GUARD,
          useFactory: (r: Reflector, j: JwtService, c: ConfigService, jwks: JwksService) =>
            new JwtAuthGuard(r, j, c, jwks),
          inject: [Reflector, JwtService, ConfigService, JwksService],
        },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    config.set('ANALITICA_URL', 'https://analitica.example');
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    );
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it.each(['administrador', 'operador', 'delegados'])(
    'autoriza %s antes de consultar y devuelve JSON sin cache',
    async (group) => {
      const bearer = token([group]);
      const r = await get(bearer, '?dashboard=reclamos&url=https://otro.example').expect(200);
      expect(r.body).toEqual({ html });
      expect(r.headers['content-type']).toContain('application/json');
      expect(r.headers['cache-control']).toContain('no-store');
      expect(r.headers.vary).toContain('Authorization');
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.href).toBe('https://analitica.example/embed?dashboard=residuos');
      expect(init).toMatchObject({
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'text/html' },
        cache: 'no-store',
        redirect: 'error',
        credentials: 'omit',
      });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(url.href).not.toContain(bearer);
    },
  );
  it('no llama al proveedor sin identidad', async () => {
    await request(app.getHttpServer()).get('/api/v1/metricas/tablero').expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([['chofer'], [], ['desconocido']])(
    'no llama con grupos no autorizados: %j',
    async (...groups) => {
      await get(token(groups.flat())).expect(403);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('rechaza credenciales internas aun con grupos operativos', async () => {
    await get(
      token(['administrador'], { token_use: 'chofer-interno' }, EMISOR_CHOFERES_DEFAULT),
    ).expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rechaza otro modulo sin consultar Analitica', async () => {
    await get(token(['administrador'], { module: 'reclamos' })).expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('no inventa department ni reemplaza el token de Login', async () => {
    const bearer = token();
    await get(bearer).expect(200);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${bearer}`,
    });
  });
  it('sin URL avisa que falta conectar el tablero y no hace requests', async () => {
    config.set('ANALITICA_URL', '');
    const r = await get().expect(503);
    expect(r.body.code).toBe('ANALITICA_NO_CONFIGURADA');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [400, 'ANALITICA_TABLERO_INVALIDO'],
    [401, 'ANALITICA_SESION_VENCIDA'],
    [403, 'ANALITICA_MODULO_NO_AUTORIZADO'],
    [503, 'ANALITICA_NO_DISPONIBLE'],
  ])('maneja HTTP %i sin exponer el cuerpo del proveedor', async (status, code) => {
    fetchMock.mockResolvedValue(new Response('detalle-privado-del-proveedor', { status }));
    const r = await get().expect(status);
    expect(r.body.code).toBe(code);
    expect(r.text).not.toContain('detalle-privado');
  });
  it.each(['red', 'timeout', 'redireccion'])(
    'maneja fallos de %s sin exponer credenciales',
    async (causa) => {
      fetchMock.mockRejectedValue(new Error(causa + ' token-privado'));
      const r = await get().expect(503);
      expect(r.body.code).toBe('ANALITICA_NO_DISPONIBLE');
      expect(r.text).not.toContain('token-privado');
    },
  );
  it.each([
    ['application/json', '{}'],
    ['text/html', '   '],
  ])('rechaza un tablero que no sea HTML util: %s', async (type, body) => {
    fetchMock.mockResolvedValue(new Response(body, { headers: { 'Content-Type': type } }));
    expect((await get().expect(503)).body.code).toBe('ANALITICA_NO_DISPONIBLE');
  });
});
