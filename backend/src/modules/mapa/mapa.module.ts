import { Module } from '@nestjs/common';
import { AlertasModule } from '../alertas/alertas.module';
import { ContenedoresModule } from '../contenedores/contenedores.module';
import { MapaService } from './application/mapa.service';
import { MapaController } from './mapa.controller';
import { ContingenciasModule } from '../contingencias/contingencias.module';

@Module({
  imports: [ContenedoresModule, AlertasModule, ContingenciasModule],
  controllers: [MapaController],
  providers: [MapaService],
})
export class MapaModule {}
