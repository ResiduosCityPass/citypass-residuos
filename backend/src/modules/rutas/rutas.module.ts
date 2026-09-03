import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertasModule } from '../alertas/alertas.module';
import { ContenedoresModule } from '../contenedores/contenedores.module';
import { FlotaModule } from '../flota/flota.module';
import { ZonasModule } from '../zonas/zonas.module';
import { ParadasService } from './application/paradas.service';
import { RutasService } from './application/rutas.service';
import { Parada } from './domain/parada.entity';
import { PARADA_REPOSITORY } from './domain/parada.repository';
import { Ruta } from './domain/ruta.entity';
import { RUTA_REPOSITORY } from './domain/ruta.repository';
import { ParadaTypeormRepository } from './infrastructure/parada.typeorm.repository';
import { RutaTypeormRepository } from './infrastructure/ruta.typeorm.repository';
import { ParadasController } from './paradas.controller';
import { RutasController } from './rutas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ruta, Parada]),
    ContenedoresModule,
    FlotaModule,
    ZonasModule,
    AlertasModule,
  ],
  controllers: [RutasController, ParadasController],
  providers: [
    RutasService,
    ParadasService,
    { provide: RUTA_REPOSITORY, useClass: RutaTypeormRepository },
    { provide: PARADA_REPOSITORY, useClass: ParadaTypeormRepository },
  ],
  exports: [RutasService, ParadasService],
})
export class RutasModule {}
