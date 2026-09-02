import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlotaService } from './application/flota.service';
import { Camion } from './domain/camion.entity';
import { CAMION_REPOSITORY } from './domain/camion.repository';
import { FlotaController } from './flota.controller';
import { CamionTypeormRepository } from './infrastructure/camion.typeorm.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Camion])],
  controllers: [FlotaController],
  providers: [FlotaService, { provide: CAMION_REPOSITORY, useClass: CamionTypeormRepository }],
  exports: [FlotaService, CAMION_REPOSITORY],
})
export class FlotaModule {}
