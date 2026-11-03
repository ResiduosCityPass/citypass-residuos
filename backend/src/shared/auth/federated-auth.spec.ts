import { ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'crypto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwksService } from './jwks.service';
import { SesionController } from './sesion.controller';
import { Request } from 'express';

describe('Login federado: firma real y limites de confianza', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const jwt = new JwtService();
  const claims = {
    sub: 'delegado-res',
    ver: 1,
    groups: ['delegados'],
    token_use: 'human',
    module: 'residuos',
  };
  const sign = (patch = {}, options = {}) =>
    jwt.sign(
      { ...claims, ...patch },
      {
        privateKey,
        algorithm: 'RS256',
        keyid: 'idp-key',
        issuer: 'https://idp.example',
        audience: ['citypass-residuos-api'],
        expiresIn: 300,
        ...options,
      },
    );
  let guard: JwtAuthGuard;
  const verify = (token: string) => {
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    return {
      req,
      run: () =>
        guard.canActivate({
          getHandler: () => jest.fn(),
          getClass: () => jest.fn(),
          switchToHttp: () => ({ getRequest: () => req }),
        } as unknown as ExecutionContext),
    };
  };
  beforeEach(() => {
    guard = new JwtAuthGuard(
      new Reflector(),
      jwt,
      new ConfigService({
        AUTH_MODE: 'federated',
        JWT_SECRET: 'local-driver-secret',
        JWT_ISSUER: 'https://idp.example',
        JWT_OPERATOR_GROUPS: 'residuos-operador',
      }),
      { clave: jest.fn().mockResolvedValue(publicKey) } as unknown as JwksService,
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('autentica al delegado pero no le inventa un rol operativo', async () => {
    const check = verify(sign());
    await expect(check.run()).resolves.toBe(true);
    expect(new SesionController().obtener(check.req)).toEqual({
      sub: 'delegado-res',
      nombre: 'delegado-res',
      rol: null,
    });
  });
  it.each([
    ['residuos-administradores', 'ADMINISTRADOR'],
    ['residuos-operadores', 'OPERADOR'],
  ])('conserva el grupo de develop %s', async (grupo, rol) => {
    guard = new JwtAuthGuard(
      new Reflector(),
      jwt,
      new ConfigService({
        AUTH_MODE: 'federated',
        JWT_SECRET: 'local-driver-secret',
        JWT_ISSUER: 'https://idp.example',
      }),
      { clave: jest.fn().mockResolvedValue(publicKey) } as unknown as JwksService,
    );
    const check = verify(sign({ groups: [grupo] }));
    await check.run();
    expect(check.req.usuario?.rol).toBe(rol);
  });
  it('resuelve solamente los grupos configurados', async () => {
    const check = verify(sign({ groups: ['residuos-operador'] }));
    await check.run();
    expect(check.req.usuario?.rol).toBe('OPERADOR');
  });
  it('acepta aud escalar del IdP real y delegados como OPERADOR, nunca como admin', async () => {
    guard = new JwtAuthGuard(
      new Reflector(),
      jwt,
      new ConfigService({
        AUTH_MODE: 'federated',
        JWT_SECRET: 'local-driver-secret',
        JWT_ISSUER: 'https://idp.example',
      }),
      { clave: jest.fn().mockResolvedValue(publicKey) } as unknown as JwksService,
    );
    const check = verify(sign({}, { audience: 'citypass-residuos-api' }));
    await check.run();
    expect(check.req.usuario?.rol).toBe('OPERADOR');
  });
  it('rechaza un token de otro modulo aunque incluya grupos conocidos', async () => {
    await expect(
      verify(sign({ module: 'reclamos', groups: ['administrador'] })).run(),
    ).rejects.toThrow('Token invalido');
  });
  it.each([
    [{}, { issuer: 'otro-emisor' }],
    [{}, { audience: ['otra-api'] }],
    [{ token_use: 'service' }, {}],
    [{ ver: 2 }, {}],
    [{ groups: 'administrador' }, {}],
    [{}, { expiresIn: -60 }],
  ])('rechaza claims incompatibles', async (patch, options) => {
    await expect(verify(sign(patch, options)).run()).rejects.toThrow('Token invalido');
  });
  it('rechaza una firma ajena aunque los claims y kid sean correctos', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expect(verify(sign({}, { privateKey: other.privateKey })).run()).rejects.toThrow(
      'Token invalido',
    );
  });
  it('conserva la credencial interna del chofer con HS256 y su emisor propio', async () => {
    const token = jwt.sign(
      { ...claims, token_use: 'chofer-interno', groups: ['chofer'] },
      {
        secret: 'local-driver-secret',
        issuer: 'citypass-residuos-choferes',
        audience: ['citypass-residuos-api'],
        expiresIn: 300,
        algorithm: 'HS256',
      },
    );
    const check = verify(token);
    await expect(check.run()).resolves.toBe(true);
    expect(check.req.usuario?.rol).toBe('CHOFER');
  });
  it('rechaza humanos firmados localmente cuando esta activado el IdP', async () => {
    const token = jwt.sign(claims, {
      secret: 'local-driver-secret',
      issuer: 'citypass-residuos-choferes',
    });
    await expect(verify(token).run()).rejects.toThrow('Token invalido');
  });
  it('rechaza tokens sin firma y algoritmos alternativos', async () => {
    await expect(verify(jwt.sign(claims, { algorithm: 'none' })).run()).rejects.toThrow(
      'Token invalido',
    );
    await expect(verify('malformado').run()).rejects.toThrow('Token invalido');
  });
});
