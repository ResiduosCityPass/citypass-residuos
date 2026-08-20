import { Module } from '@nestjs/common';
import { ContenedoresModule } from '../contenedores/contenedores.module';
import { MapaController } from './mapa.controller';

@Module({
  imports: [ContenedoresModule],
  controllers: [MapaController],
})
export class MapaModule {}
