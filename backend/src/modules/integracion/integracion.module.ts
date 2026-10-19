import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContenedoresModule } from '../contenedores/contenedores.module';
import { ZonasModule } from '../zonas/zonas.module';
import { IntegracionService } from './application/integracion.service';
import { CitypassWebhookController } from './citypass-webhook.controller';
import { BloqueoPorIncidente } from './domain/bloqueo-por-incidente.entity';
import { EventoRecibido } from './domain/evento-recibido.entity';
import { INTEGRACION_REPOSITORY, REFUERZOS_VIGENTES } from './domain/integracion.repository';
import { RefuerzoEvento } from './domain/refuerzo-evento.entity';
import { IntegracionTypeormRepository } from './infrastructure/integracion.typeorm.repository';

/** Integracion con los otros modulos de CityPass+ via el bus del Squad 1 (CU-INT-01). */
@Module({
  imports: [
    TypeOrmModule.forFeature([EventoRecibido, RefuerzoEvento, BloqueoPorIncidente]),
    ContenedoresModule,
    ZonasModule,
  ],
  controllers: [CitypassWebhookController],
  providers: [
    IntegracionService,
    IntegracionTypeormRepository,
    { provide: INTEGRACION_REPOSITORY, useExisting: IntegracionTypeormRepository },
    { provide: REFUERZOS_VIGENTES, useExisting: IntegracionTypeormRepository },
  ],
  exports: [REFUERZOS_VIGENTES],
})
export class IntegracionModule {}
