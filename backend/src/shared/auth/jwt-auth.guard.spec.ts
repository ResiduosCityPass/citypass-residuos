import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Rol } from '../domain/enums';
import { JwtAuthGuard } from './jwt-auth.guard';

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

  beforeEach(() => {
    reflector = new Reflector();
    jwtService = { verifyAsync: jest.fn() };
    config = { get: jest.fn().mockReturnValue('test-secret') };
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

  it('adjunta los claims al request cuando el token es valido', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const claims = { sub: 'u-1', username: 'jperez', rol: Rol.CHOFER };
    jwtService.verifyAsync.mockResolvedValue(claims);
    const { context, request } = contextoCon({ authorization: 'Bearer token-valido' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.usuario).toEqual(claims);
  });
});
