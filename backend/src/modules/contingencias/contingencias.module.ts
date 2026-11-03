import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContingenciasService } from './application/contingencias.service';
import {
  Contingencia,
  ContingenciaContenedor,
  ContingenciaZona,
  EventoClimaticoRecibido,
} from './domain/contingencia.entity';
import { CONTINGENCIA_REPOSITORY } from './domain/contingencia.repository';
import { ContingenciaTypeormRepository } from './infrastructure/contingencia.typeorm.repository';
import { ContingenciasController } from './contingencias.controller';
import {
  AlertaClimaticaExterna,
  ALERTA_CLIMATICA_REPOSITORY,
} from './domain/alerta-climatica.entity';
import { AlertaClimaticaTypeormRepository } from './infrastructure/alerta-climatica.typeorm.repository';
import { CriticidadClimaticaService } from './application/criticidad-climatica.service';
import { CriticidadClimaticaController } from './criticidad-climatica.controller';
import { EdaTransportModule } from '../../shared/events/eda/eda-transport.module';
import { EntregaEda } from './domain/entrega-eda.entity';
import { RecepcionEdaService } from './application/recepcion-eda.service';
import { EdaClimaConsumer } from './infrastructure/eda-clima.consumer';

@Module({
  imports: [
    EdaTransportModule,
    TypeOrmModule.forFeature([
      Contingencia,
      ContingenciaContenedor,
      ContingenciaZona,
      EventoClimaticoRecibido,
      AlertaClimaticaExterna,
      EntregaEda,
    ]),
  ],
  providers: [
    ContingenciasService,
    CriticidadClimaticaService,
    RecepcionEdaService,
    EdaClimaConsumer,
    { provide: ALERTA_CLIMATICA_REPOSITORY, useClass: AlertaClimaticaTypeormRepository },
    { provide: CONTINGENCIA_REPOSITORY, useClass: ContingenciaTypeormRepository },
  ],
  // La ruta estatica /clima debe registrarse antes de /:id.
  controllers: [CriticidadClimaticaController, ContingenciasController],
  exports: [ContingenciasService, CriticidadClimaticaService],
})
export class ContingenciasModule {}
