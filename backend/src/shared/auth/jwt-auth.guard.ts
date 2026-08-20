import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtPayload } from './jwt-payload';

/**
 * Guard global de identidad (ADR-005).
 *
 * Se registra como APP_GUARD, asi que protege todos los endpoints salvo los
 * marcados con @Public(). La proteccion es el default; abrir un endpoint es una
 * decision explicita y revisable.
 *
 * Sprints 1-2: verifica tokens firmados localmente con JWT_SECRET.
 * Sprint 3:    se apunta al emisor del Squad 2 cambiando configuracion, sin tocar codigo.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (esPublico) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extraerToken(request);

    if (!token) {
      throw new UnauthorizedException('Falta el header Authorization: Bearer <token>');
    }

    try {
      request.usuario = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      return true;
    } catch (error) {
      this.logger.warn(`Token rechazado: ${(error as Error).message}`);
      throw new UnauthorizedException('Token invalido o expirado');
    }
  }

  private extraerToken(request: Request): string | undefined {
    const [tipo, token] = request.headers.authorization?.split(' ') ?? [];
    return tipo === 'Bearer' ? token : undefined;
  }
}
