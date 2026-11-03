import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contenedor } from '../contenedores/domain/contenedor.entity';
import { ZonasService } from './application/zonas.service';
import { Zona } from './domain/zona.entity';
import { ZONA_REPOSITORY } from './domain/zona.repository';
import { ZonaTypeormRepository } from './infrastructure/zona.typeorm.repository';
import { ZonasController } from './zonas.controller';
import { ContingenciasModule } from '../contingencias/contingencias.module';

@Module({
  imports: [TypeOrmModule.forFeature([Zona, Contenedor]), ContingenciasModule],
  controllers: [ZonasController],
  providers: [ZonasService, { provide: ZONA_REPOSITORY, useClass: ZonaTypeormRepository }],
  exports: [ZonasService],
})
export class ZonasModule {}
