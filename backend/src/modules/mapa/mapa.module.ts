import { Module } from '@nestjs/common';
import { AlertasModule } from '../alertas/alertas.module';
import { ContenedoresModule } from '../contenedores/contenedores.module';
import { MapaService } from './application/mapa.service';
import { MapaController } from './mapa.controller';

@Module({
  imports: [ContenedoresModule, AlertasModule],
  controllers: [MapaController],
  providers: [MapaService],
})
export class MapaModule {}
