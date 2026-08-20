import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZonasModule } from '../zonas/zonas.module';
import { ContenedoresService } from './application/contenedores.service';
import { ContenedoresController } from './contenedores.controller';
import { Contenedor } from './domain/contenedor.entity';
import { CONTENEDOR_REPOSITORY } from './domain/contenedor.repository';
import { Sensor } from './domain/sensor.entity';
import { SENSOR_REPOSITORY } from './domain/sensor.repository';
import { ContenedorTypeormRepository } from './infrastructure/contenedor.typeorm.repository';
import { SensorTypeormRepository } from './infrastructure/sensor.typeorm.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Contenedor, Sensor]), ZonasModule],
  controllers: [ContenedoresController],
  providers: [
    ContenedoresService,
    { provide: CONTENEDOR_REPOSITORY, useClass: ContenedorTypeormRepository },
    { provide: SENSOR_REPOSITORY, useClass: SensorTypeormRepository },
  ],
  exports: [ContenedoresService, CONTENEDOR_REPOSITORY, SENSOR_REPOSITORY],
})
export class ContenedoresModule {}
