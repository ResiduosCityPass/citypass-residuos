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
import { JwksService } from './jwks.service';
import { CodigoChoferService } from './codigo-chofer.service';
import { Rol } from '../domain/enums';

/**
 * Guard global de identidad (ADR-005).
 *
 * Se registra como APP_GUARD, asi que protege todos los endpoints salvo los
 * marcados con @Public(). La proteccion es el default; abrir un endpoint es una
 * decision explicita y revisable.
 *
 * AUTH_MODE=local verifica los tokens HS256 de desarrollo. En federated los
 * humanos requieren RS256 y una clave del JWKS configurado del IdP. Ambos
 * caminos validan las claims del contrato de identidad de este repositorio.
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
    private readonly jwks: JwksService,
    private readonly codigos?: CodigoChoferService,
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
      const payload = token.startsWith('CH-')
        ? await this.verificarCodigo(token)
        : this.config.get<string>('AUTH_MODE', 'local') === 'federated'
          ? await this.verificarFederado(token)
          : await this.jwtService.verifyAsync<JwtPayload>(token, {
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

      request.usuario = { ...payload, rol: this.rol(payload) };
      return true;
    } catch (error) {
      this.logger.warn(`Token rechazado: ${(error as Error).message}`);
      throw new UnauthorizedException('Token invalido o expirado');
    }
  }

  private verificarCodigo(token: string): Promise<JwtPayload> {
    if (!this.codigos) throw new Error('Verificación de códigos no disponible');
    return this.codigos.verificar(token);
  }

  private async verificarFederado(token: string): Promise<JwtPayload> {
    // El header solo elige una via de verificacion; no otorga identidad.
    const decoded = this.jwtService.decode(token, { complete: true });
    if (!decoded || typeof decoded !== 'object') throw new Error('JWT malformado');
    const { header } = decoded;
    if (header.alg === 'RS256') {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: await this.jwks.clave(header.kid),
        algorithms: ['RS256'],
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        clockTolerance: 30,
      });
      if (payload.token_use !== 'human') throw new Error('El IdP debe emitir token humano');
      return payload;
    }
    if (header.alg === 'HS256') {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        algorithms: ['HS256'],
        issuer: this.config.get<string>('JWT_ISSUER_CHOFERES', EMISOR_CHOFERES_DEFAULT),
        clockTolerance: 30,
      });
      if (payload.token_use !== 'chofer-interno') throw new Error('Credencial interna incorrecta');
      return payload;
    }
    throw new Error('Algoritmo de firma no permitido');
  }

  private rol(payload: JwtPayload): Rol | undefined {
    if (payload.token_use === 'chofer-interno') return resolverRol(payload.groups ?? []);
    const roles: Array<[string, string, Rol]> = [
      ['JWT_ADMIN_GROUPS', 'administrador,residuos-administradores', Rol.ADMINISTRADOR],
      ['JWT_OPERATOR_GROUPS', 'operador,delegados,residuos-operadores', Rol.OPERADOR],
      ['JWT_DRIVER_GROUPS', 'chofer', Rol.CHOFER],
    ];
    const mapping = new Map(
      roles.flatMap(([setting, fallback, rol]) =>
        this.config
          .get<string>(setting, fallback)
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
          .map((g): [string, Rol] => [g, rol]),
      ),
    );
    return resolverRol(payload.groups ?? [], mapping);
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
    const audiencias = Array.isArray(payload.aud)
      ? payload.aud
      : this.config.get<string>('AUTH_MODE', 'local') === 'federated' &&
          typeof payload.aud === 'string'
        ? [payload.aud]
        : [];
    if (!audiencias.includes(audiencia)) {
      throw new Error('Audience del token no incluye a esta API');
    }
    if (
      payload.token_use === 'human' &&
      this.config.get<string>('AUTH_MODE', 'local') === 'federated' &&
      payload.module !== this.config.get<string>('JWT_MODULE', 'residuos')
    ) {
      throw new Error('El token pertenece a otro modulo');
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Token sin sub');
    }
    if (
      payload.groups !== undefined &&
      (!Array.isArray(payload.groups) || payload.groups.some((g) => typeof g !== 'string'))
    ) {
      throw new Error('groups debe ser una lista de nombres de grupo');
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
