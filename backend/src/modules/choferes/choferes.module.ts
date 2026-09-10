import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RutasModule } from '../rutas/rutas.module';
import { ChoferesService } from './application/choferes.service';
import { ChoferesController } from './choferes.controller';
import { Chofer } from './domain/chofer.entity';
import { CHOFER_REPOSITORY } from './domain/chofer.repository';
import { ChoferTypeormRepository } from './infrastructure/chofer.typeorm.repository';

@Module({
  // `forwardRef` porque RutasModule ya importa este: el chofer necesita saber si
  // tiene una ruta viva antes de darse de baja, y la ruta necesita validar al
  // chofer antes de asignarse.
  imports: [TypeOrmModule.forFeature([Chofer]), forwardRef(() => RutasModule)],
  controllers: [ChoferesController],
  providers: [ChoferesService, { provide: CHOFER_REPOSITORY, useClass: ChoferTypeormRepository }],
  exports: [ChoferesService, CHOFER_REPOSITORY],
})
export class ChoferesModule {}
