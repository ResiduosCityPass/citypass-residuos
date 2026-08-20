import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertasModule } from '../alertas/alertas.module';
import { ContenedoresModule } from '../contenedores/contenedores.module';
import { ZonasModule } from '../zonas/zonas.module';
import { LecturasService } from './application/lecturas.service';
import { Lectura } from './domain/lectura.entity';
import { LECTURA_REPOSITORY } from './domain/lectura.repository';
import { LecturaTypeormRepository } from './infrastructure/lectura.typeorm.repository';
import { LecturasController } from './lecturas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Lectura]), ContenedoresModule, ZonasModule, AlertasModule],
  controllers: [LecturasController],
  providers: [LecturasService, { provide: LECTURA_REPOSITORY, useClass: LecturaTypeormRepository }],
  exports: [LecturasService, LECTURA_REPOSITORY],
})
export class LecturasModule {}
