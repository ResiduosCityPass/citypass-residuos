import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

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
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET'),
        // El tipo de `expiresIn` viene de la libreria `ms` y no acepta un string
        // generico, pero el valor real sale de configuracion. Se acota el tipo aca.
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h'),
          issuer: config.get<string>('JWT_ISSUER'),
          // Array, no string suelto: el contrato del Squad 2 exige `aud` como lista
          // siempre (docs/arquitectura/contrato-identidad-token.md §3), y el guard
          // rechaza a proposito cualquier `aud` que no sea array (§4, "trampas").
          // Firmar un string acá haría que el propio backend rechace sus tokens.
          audience: [config.get<string>('JWT_AUDIENCE', 'citypass-residuos-api')],
          algorithm: config.get<string>('JWT_ALGORITHM', 'HS256'),
        } as JwtModuleOptions['signOptions'],
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
