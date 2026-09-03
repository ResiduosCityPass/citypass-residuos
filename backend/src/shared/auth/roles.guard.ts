import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Rol } from '../domain/enums';
import { ROLES_KEY } from './roles.decorator';

/**
 * Autorizacion por rol (ADR-005).
 *
 * Corre despues de JwtAuthGuard. Si el endpoint no declara @Roles(), no restringe:
 * la autenticacion ya la resolvio el guard anterior.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }

    const { usuario } = context.switchToHttp().getRequest<Request>();

    if (!usuario?.rol || !rolesRequeridos.includes(usuario.rol)) {
      throw new ForbiddenException(
        `Este recurso requiere uno de los roles: ${rolesRequeridos.join(', ')}`,
      );
    }

    return true;
  }
}
