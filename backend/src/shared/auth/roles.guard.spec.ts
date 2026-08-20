import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '../domain/enums';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const contextoCon = (usuario?: { rol: Rol }): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ usuario }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('deja pasar cuando el endpoint no declara roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(contextoCon({ rol: Rol.CIUDADANO }))).toBe(true);
  });

  it('deja pasar cuando el rol del usuario esta entre los permitidos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Rol.OPERADOR, Rol.ADMINISTRADOR]);

    expect(guard.canActivate(contextoCon({ rol: Rol.OPERADOR }))).toBe(true);
  });

  it('rechaza cuando el rol no esta entre los permitidos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Rol.ADMINISTRADOR]);

    expect(() => guard.canActivate(contextoCon({ rol: Rol.CHOFER }))).toThrow(ForbiddenException);
  });

  it('rechaza cuando no hay usuario en el request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Rol.ADMINISTRADOR]);

    expect(() => guard.canActivate(contextoCon(undefined))).toThrow(ForbiddenException);
  });
});
