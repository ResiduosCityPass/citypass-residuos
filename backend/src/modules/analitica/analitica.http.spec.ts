import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EMISOR_CHOFERES_DEFAULT, EMISOR_TOKEN_DEFAULT } from '../../config/env.validation';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { JwksService } from '../../shared/auth/jwks.service';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SesionController } from '../../shared/auth/sesion.controller';
import { AnaliticaModule } from './analitica.module';

describe('Proxy de Analitica por HTTP, con los guards reales', () => {
  let app: INestApplication;
  let fetchMock: jest.SpyInstance;
  const config = new ConfigService({
    JWT_SECRET: 'test-tablero',
    AUTH_MODE: 'local',
    NODE_ENV: 'test',
    ANALITICA_URL: 'https://analitica.example',
  });
  const jwt = new JwtService();
  const token = (
    groups = ['administrador'],
    patch = {},
    issuer = EMISOR_TOKEN_DEFAULT,
    expiresIn = 900,
  ) =>
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
      { secret: 'test-tablero', issuer, audience: ['citypass-residuos-api'], expiresIn },
    );
  const html = '<!doctype html><html><body>Cuadrillas afectadas por clima — Residuos</body></html>';
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'private, no-store',
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
  const id = '550e8400-e29b-41d4-a716-446655440001';
  const path = `/api/v1/metricas/tableros/${id}`;
  const create = (bearer = token(), body = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/metricas/tableros')
      .set('Authorization', `Bearer ${bearer}`)
      .send(body);
  const get = (bearer = token()) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${bearer}`);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AnaliticaModule],
      controllers: [SesionController],
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    config.set('ANALITICA_URL', 'https://analitica.example');
    config.set('NODE_ENV', 'test');
    config.set('API_PREFIX', 'api/v1');
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response(html, { status: 200, headers }));
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it.each(['administrador', 'operador', 'delegados'])(
    'autoriza %s y carga HTML por cookie solo en el iframe',
    async (group) => {
      const bearer = token([group]);
      const created = await create(bearer).expect(201);
      expect(created.body.url).toBe(`/api/v1/metricas/tableros/${created.body.vistaId}`);
      expect(created.text).not.toContain(bearer);
      const cookie = created.headers['set-cookie'][0];
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Max-Age=120');
      expect(cookie).toContain(`Path=${created.body.url}`);
      const r = await request(app.getHttpServer())
        .get(created.body.url + '?dashboard=reclamos&token=no')
        .set('Cookie', cookie.split(';')[0])
        .expect(200);
      expect(r.text).toBe(html);
      for (const [key, value] of Object.entries(headers)) expect(r.headers[key]).toBe(value);
      expect(r.headers.vary).toContain('Cookie');
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.href).toBe('https://analitica.example/embed/residuos');
      expect(init).toMatchObject({
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'text/html' },
        cache: 'no-store',
        redirect: 'error',
        credentials: 'omit',
      });
      expect(init).not.toHaveProperty('body');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(url.href).not.toContain(bearer);
    },
  );
  it('en produccion exige Secure y no crea cookies generales ni compartidas entre vistas', async () => {
    config.set('NODE_ENV', 'production');
    const a = await create().expect(201);
    const b = await create().expect(201);
    expect(a.headers['set-cookie'][0]).toContain('Secure');
    expect(a.headers['set-cookie'][0]).not.toContain('Domain=');
    expect(a.body.url).not.toBe(b.body.url);
  });
  it('la cookie no autentica otros endpoints ni la creacion de otra vista', async () => {
    const r = await create().expect(201);
    const cookie = r.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).get('/api/v1/auth/sesion').set('Cookie', cookie).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/metricas/tableros')
      .set('Cookie', cookie)
      .send({})
      .expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('el id y el query de una vista no dan acceso sin la cookie', async () => {
    const r = await create().expect(201);
    await request(app.getHttpServer())
      .get(r.body.url + '?token=' + token())
      .expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('no crea la vista sin identidad', async () => {
    await request(app.getHttpServer()).post('/api/v1/metricas/tableros').send({}).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([['chofer'], [], ['desconocido']])(
    'no consulta con grupos no autorizados: %j',
    async (...groups) => {
      await create(token(groups.flat())).expect(403);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('rechaza credenciales internas aunque tengan grupos operativos', async () => {
    await create(
      token(['administrador'], { token_use: 'chofer-interno' }, EMISOR_CHOFERES_DEFAULT),
    ).expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rechaza otro modulo antes de crear la cookie', async () => {
    const r = await create(token(['administrador'], { module: 'reclamos' })).expect(403);
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('un token casi vencido pide renovar antes de crear una cookie', async () => {
    await create(token(['administrador'], {}, EMISOR_TOKEN_DEFAULT, 2)).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('el Bearer explicito prevalece sobre la cookie y se verifica', async () => {
    await get('invalido').set('Cookie', `citypass_analitica=${token()}`).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('elimina solo la cookie de su vista, incluso despues de cerrar sesion', async () => {
    const r = await request(app.getHttpServer()).delete(path).expect(204);
    expect(r.headers['set-cookie'][0]).toContain(`Path=${path}`);
    expect(r.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('respeta un API_PREFIX configurado al emitir el path de la cookie', async () => {
    config.set('API_PREFIX', '/api/v2/');
    const r = await create().expect(201);
    expect(r.body.url).toContain('/api/v2/metricas/tableros/');
  });
  it('rechaza un id mal formado en vez de usarlo como path de cookie', async () => {
    await request(app.getHttpServer()).delete('/api/v1/metricas/tableros/no-es-uuid').expect(400);
  });
  it('sin URL el POST de verificacion informa que falta conectar el tablero', async () => {
    config.set('ANALITICA_URL', '');
    const r = await create(token(), { verificar: true }).expect(503);
    expect(r.body.code).toBe('ANALITICA_NO_CONFIGURADA');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('la verificacion no devuelve HTML ni permite mandar destinos propios', async () => {
    const r = await create(token(), { verificar: true }).expect(201);
    expect(r.text).not.toContain('Cuadrillas');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await create(token(), { destino: 'https://otro.example' }).expect(400);
  });
  it.each([400, 401, 403, 404, 503])(
    'maneja HTTP %i sin exponer el cuerpo del proveedor',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('detalle-privado-del-proveedor', { status }));
      const r = await get().expect(status);
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.headers['cache-control']).toContain('no-store');
      expect(r.text).toContain(`estado:${status}`);
      expect(r.text).not.toContain('detalle-privado');
    },
  );
  it('un 401 al verificar sigue siendo JSON para que el cliente renueve una sola vez', async () => {
    fetchMock.mockResolvedValue(new Response('privado', { status: 401 }));
    const r = await create(token(), { verificar: true }).expect(401);
    expect(r.body.code).toBe('ANALITICA_SESION_VENCIDA');
  });
  it.each(['red', 'timeout', 'redireccion'])(
    'maneja fallos de %s sin exponer credenciales',
    async (causa) => {
      fetchMock.mockRejectedValue(new Error(causa + ' token-privado'));
      const r = await get().expect(503);
      expect(r.text).not.toContain('token-privado');
    },
  );
  it.each([
    ['application/json', '{}'],
    ['text/html', '   '],
  ])('rechaza contenido invalido: %s', async (type, body) => {
    fetchMock.mockResolvedValue(
      new Response(body, { headers: { ...headers, 'content-type': type } }),
    );
    await get().expect(503);
  });
  it('rechaza contenido sin CSP o que permita cachearlo', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(html, { headers: { 'content-type': 'text/html' } }),
    );
    await get().expect(503);
    fetchMock.mockResolvedValueOnce(
      new Response(html, { headers: { ...headers, 'cache-control': 'public' } }),
    );
    await get().expect(503);
  });
});
