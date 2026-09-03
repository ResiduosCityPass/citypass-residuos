import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { EMISOR_TOKEN_DEFAULT } from '../../config/env.validation';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Configuracion del firmado de tokens.
 *
 * Esta afuera del decorador para poder testearla: es una funcion pura sobre el
 * ConfigService, y el bug que la puso aca —un `issuer` undefined que solo
 * explota al firmar el primer token— no lo agarra ningun test de endpoint que
 * corra con un `.env` presente.
 */
export function opcionesJwt(config: ConfigService): JwtModuleOptions {
  return {
    secret: config.get<string>('JWT_SECRET'),
    // El tipo de `expiresIn` viene de la libreria `ms` y no acepta un string
    // generico, pero el valor real sale de configuracion. Se acota el tipo aca.
    signOptions: {
      expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h'),
      // Sin valor por defecto, `jsonwebtoken` tira "issuer must be a string"
      // cuando no hay `.env` —el caso del CI y el de cualquier despliegue que
      // configure solo lo minimo.
      issuer: config.get<string>('JWT_ISSUER', EMISOR_TOKEN_DEFAULT),
    } as JwtModuleOptions['signOptions'],
  };
}

/**
 * Identidad y autorizacion (ADR-005).
 *
 * Los dos guards se registran como APP_GUARD, en este orden: primero se resuelve
 * quien sos, despues si podes. Todo endpoint queda protegido salvo que se marque
 * con @Public().
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: opcionesJwt,
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
