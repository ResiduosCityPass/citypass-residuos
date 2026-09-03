import { Module } from '@nestjs/common';
import { ContenedoresModule } from '../contenedores/contenedores.module';
import { LecturasModule } from '../lecturas/lecturas.module';
import { ZonasModule } from '../zonas/zonas.module';
import { PrediccionService } from './application/prediccion.service';
import { PrediccionController } from './prediccion.controller';

@Module({
  imports: [ContenedoresModule, LecturasModule, ZonasModule],
  controllers: [PrediccionController],
  providers: [PrediccionService],
  exports: [PrediccionService],
})
export class PrediccionModule {}
