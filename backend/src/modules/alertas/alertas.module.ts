import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertasService } from './application/alertas.service';
import { AlertasController } from './alertas.controller';
import { Alerta } from './domain/alerta.entity';
import { ALERTA_REPOSITORY } from './domain/alerta.repository';
import { AlertaTypeormRepository } from './infrastructure/alerta.typeorm.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Alerta])],
  controllers: [AlertasController],
  providers: [AlertasService, { provide: ALERTA_REPOSITORY, useClass: AlertaTypeormRepository }],
  exports: [AlertasService],
})
export class AlertasModule {}
