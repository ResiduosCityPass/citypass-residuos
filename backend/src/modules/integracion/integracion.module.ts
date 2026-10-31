import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContenedoresModule } from '../contenedores/contenedores.module';
import { RutasModule } from '../rutas/rutas.module';
import { ZonasModule } from '../zonas/zonas.module';
import { ActividadesMasivasController } from './actividades-masivas.controller';
import { ActividadesMasivasService } from './application/actividades-masivas.service';
import { IntegracionService } from './application/integracion.service';
import { ReclamosService } from './application/reclamos.service';
import { CitypassWebhookController } from './citypass-webhook.controller';
import { ActividadMasiva } from './domain/actividad-masiva.entity';
import { BloqueoPorIncidente } from './domain/bloqueo-por-incidente.entity';
import { EventoRecibido } from './domain/evento-recibido.entity';
import {
  INTEGRACION_REPOSITORY,
  OBSTRUCCION_REPOSITORY,
  REFUERZOS_VIGENTES,
} from './domain/integracion.repository';
import { ObstruccionPorReclamo } from './domain/obstruccion-por-reclamo.entity';
import { RefuerzoEvento } from './domain/refuerzo-evento.entity';
import { IntegracionTypeormRepository } from './infrastructure/integracion.typeorm.repository';

/** Integracion con los otros modulos de CityPass+ via el bus del Squad 1 (CU-INT-01). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventoRecibido,
      RefuerzoEvento,
      BloqueoPorIncidente,
      ActividadMasiva,
      ObstruccionPorReclamo,
    ]),
    ContenedoresModule,
    ZonasModule,
    // Circular: rutas lee refuerzos y obstrucciones de aca, y los reclamos
    // recalculan rutas (CU-INT-02).
    forwardRef(() => RutasModule),
  ],
  controllers: [CitypassWebhookController, ActividadesMasivasController],
  providers: [
    IntegracionService,
    ActividadesMasivasService,
    ReclamosService,
    IntegracionTypeormRepository,
    { provide: INTEGRACION_REPOSITORY, useExisting: IntegracionTypeormRepository },
    { provide: REFUERZOS_VIGENTES, useExisting: IntegracionTypeormRepository },
    { provide: OBSTRUCCION_REPOSITORY, useExisting: IntegracionTypeormRepository },
  ],
  exports: [REFUERZOS_VIGENTES, OBSTRUCCION_REPOSITORY],
})
export class IntegracionModule {}
