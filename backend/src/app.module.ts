import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { validarEntorno } from './config/env.validation';
import { AuthModule } from './shared/auth/auth.module';
import { EventsModule } from './shared/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { ZonasModule } from './modules/zonas/zonas.module';
import { ContenedoresModule } from './modules/contenedores/contenedores.module';
import { AlertasModule } from './modules/alertas/alertas.module';
import { LecturasModule } from './modules/lecturas/lecturas.module';
import { MapaModule } from './modules/mapa/mapa.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEntorno,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    AuthModule,
    EventsModule,
    HealthModule,
    ZonasModule,
    ContenedoresModule,
    AlertasModule,
    LecturasModule,
    MapaModule,
    // Sprint 2: PrediccionModule (CU-12)
    // Sprint 4: FlotaModule (CU-03), RutasModule (CU-08..CU-10), PublicoModule (CU-11)
  ],
})
export class AppModule {}
