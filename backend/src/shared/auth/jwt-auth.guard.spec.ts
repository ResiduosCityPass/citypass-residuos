import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsuarioAutenticado } from './jwt-payload';

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let jwtService: { verifyAsync: jest.Mock };
  let config: { get: jest.Mock };
  let guard: JwtAuthGuard;

  const contextoCon = (headers: Record<string, string> = {}) => {
    const request: Record<string, unknown> = { headers };
    const context = {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  const claimsValidos = {
    iss: 'https://idp.citypass.local',
    sub: 'U000042',
    aud: ['citypass-residuos-api'],
    token_use: 'human' as const,
    ver: 1,
    preferred_username: 'jperez',
    module: 'residuos',
    groups: ['chofer'],
    iat: 1754600000,
    exp: 1754600900,
    jti: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  };

  const configValores: Record<string, string> = {
    JWT_SECRET: 'test-secret',
    JWT_ALGORITHM: 'HS256',
    JWT_ISSUER: 'https://idp.citypass.local',
    JWT_AUDIENCE: 'citypass-residuos-api',
  };

  beforeEach(() => {
    reflector = new Reflector();
    jwtService = { verifyAsync: jest.fn() };
    config = {
      get: jest.fn((clave: string, porDefecto?: unknown) => configValores[clave] ?? porDefecto),
    };
    guard = new JwtAuthGuard(
      reflector,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
    );

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('deja pasar sin token los endpoints marcados con @Public()', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const { context } = contextoCon();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rechaza cuando no viene el header Authorization', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = contextoCon();

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un esquema de autorizacion que no sea Bearer', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = contextoCon({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token invalido o expirado', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { context } = contextoCon({ authorization: 'Bearer token-vencido' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('adjunta los claims y el rol resuelto al request cuando el token es valido', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue(claimsValidos);
    const { context, request } = contextoCon({ authorization: 'Bearer token-valido' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.usuario).toEqual({ ...claimsValidos, rol: 'CHOFER' });
  });

  it('ignora grupos desconocidos: el token es valido pero queda sin rol', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({ ...claimsValidos, groups: ['grupo-sin-mapear'] });
    const { context, request } = contextoCon({ authorization: 'Bearer token-valido' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request.usuario as UsuarioAutenticado).rol).toBeUndefined();
  });

  it('rechaza un token sin exp', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { exp: _sinExp, ...sinExp } = claimsValidos;
    jwtService.verifyAsync.mockResolvedValue(sinExp);
    const { context } = contextoCon({ authorization: 'Bearer token-sin-exp' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token de servicio en un endpoint que espera un token humano', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({ ...claimsValidos, token_use: 'service' });
    const { context } = contextoCon({ authorization: 'Bearer token-servicio' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token cuya audience no incluye a esta API', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({ ...claimsValidos, aud: ['otra-api'] });
    const { context } = contextoCon({ authorization: 'Bearer token-otra-audiencia' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una version de contrato de token distinta de 1', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({ ...claimsValidos, ver: 2 });
    const { context } = contextoCon({ authorization: 'Bearer token-version-vieja' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
