import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { validarEntorno } from './config/env.validation';
import { AuthModule } from './shared/auth/auth.module';
import { EventsModule } from './shared/events/events.module';
import { HealthModule } from './modules/health/health.module';

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
    // Sprint 1: ContenedoresModule (CU-01), ZonasModule (CU-02), LecturasModule (CU-04),
    //           AlertasModule (CU-05, CU-06)
    // Sprint 2: MapaModule (CU-07), PrediccionModule (CU-12)
    // Sprint 4: FlotaModule (CU-03), RutasModule (CU-08..CU-10), PublicoModule (CU-11)
  ],
})
export class AppModule {}
