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
import { Algorithm } from 'jsonwebtoken';
import { EMISOR_CHOFERES_DEFAULT, EMISOR_TOKEN_DEFAULT } from '../../config/env.validation';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtPayload } from './jwt-payload';
import { resolverRol } from './grupo-rol.map';

/**
 * Guard global de identidad (ADR-005).
 *
 * Se registra como APP_GUARD, asi que protege todos los endpoints salvo los
 * marcados con @Public(). La proteccion es el default; abrir un endpoint es una
 * decision explicita y revisable.
 *
 * Sprints 1-2: verifica tokens firmados localmente (HS256, JWT_SECRET), pero valida
 * las mismas claims que exige el contrato real (docs/arquitectura/contrato-identidad-token.md
 * §4) para que el Sprint 3 sea un cambio de configuracion y de resolucion de clave
 * (JWKS por `kid`, RS256), no de logica de validacion.
 *
 * Sprint 3: la resolucion de la clave de firma via JWKS SI requiere codigo nuevo (un
 * secretOrKeyProvider por `kid`) ademas de configuracion — @nestjs/jwt no trae
 * descubrimiento de JWKS. Ver accion abierta en ADR-005.
 *
 * Choferes (ADR-009): tambien acepta `token_use: "chofer-interno"`, con su propio
 * emisor (`JWT_ISSUER_CHOFERES`). No es el Squad 2 -- el chofer no se registra ni
 * inicia sesion contra ellos -- asi que se valida por una via separada de
 * `human`/`service`, nunca mezclada.
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
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
        algorithms: [this.config.get<Algorithm>('JWT_ALGORITHM', 'HS256')],
        // Lista, no un solo emisor: el chofer tiene el suyo propio (ADR-009),
        // distinto del que usan los tokens humanos. Cual de los dos corresponde
        // a cada token_use se valida aparte, en validarClaims.
        issuer: [
          this.config.get<string>('JWT_ISSUER', EMISOR_TOKEN_DEFAULT),
          this.config.get<string>('JWT_ISSUER_CHOFERES', EMISOR_CHOFERES_DEFAULT),
        ],
        clockTolerance: 30,
      });

      this.validarClaims(payload);

      request.usuario = { ...payload, rol: resolverRol(payload.groups ?? []) };
      return true;
    } catch (error) {
      this.logger.warn(`Token rechazado: ${(error as Error).message}`);
      throw new UnauthorizedException('Token invalido o expirado');
    }
  }

  /**
   * Claims que jsonwebtoken no valida por si solo (contrato §4, pasos 4/6/7 y "trampas").
   * `exp` se exige explicito: la libreria NO lo hace si el campo esta ausente.
   */
  private validarClaims(payload: JwtPayload): void {
    if (!payload.exp) {
      throw new Error('Token sin claim exp');
    }

    this.validarTokenUseYEmisor(payload);

    if (payload.ver !== 1) {
      throw new Error(`Version de contrato de token no soportada: ${payload.ver}`);
    }

    const audiencia = this.config.get<string>('JWT_AUDIENCE', 'citypass-residuos-api');
    if (!Array.isArray(payload.aud) || !payload.aud.includes(audiencia)) {
      throw new Error('Audience del token no incluye a esta API');
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Token sin sub');
    }
  }

  /**
   * `token_use` no alcanza solo: si no se cruza contra `iss`, un token con
   * `token_use: "human"` pasaria igual con el emisor del chofer (ADR-009), y
   * viceversa. La lista de emisores aceptados en `verifyAsync` solo filtra
   * emisores desconocidos; esta es la que asegura que cada `token_use` viene
   * del emisor que le corresponde.
   */
  private validarTokenUseYEmisor(payload: JwtPayload): void {
    const emisorHumano = this.config.get<string>('JWT_ISSUER', EMISOR_TOKEN_DEFAULT);
    const emisorChofer = this.config.get<string>('JWT_ISSUER_CHOFERES', EMISOR_CHOFERES_DEFAULT);

    if (payload.token_use === 'human') {
      if (payload.iss !== emisorHumano) {
        throw new Error(`Emisor inesperado para token_use human: ${payload.iss}`);
      }
      return;
    }

    if (payload.token_use === 'chofer-interno') {
      if (payload.iss !== emisorChofer) {
        throw new Error(`Emisor inesperado para token_use chofer-interno: ${payload.iss}`);
      }
      return;
    }

    throw new Error(`token_use inesperado: ${payload.token_use}`);
  }

  private extraerToken(request: Request): string | undefined {
    const [tipo, token] = request.headers.authorization?.split(' ') ?? [];
    return tipo === 'Bearer' ? token : undefined;
  }
}
