import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChoferesService } from './application/choferes.service';
import { ChoferesController } from './choferes.controller';
import { Chofer } from './domain/chofer.entity';
import { CHOFER_REPOSITORY } from './domain/chofer.repository';
import { ChoferTypeormRepository } from './infrastructure/chofer.typeorm.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Chofer])],
  controllers: [ChoferesController],
  providers: [ChoferesService, { provide: CHOFER_REPOSITORY, useClass: ChoferTypeormRepository }],
  exports: [ChoferesService, CHOFER_REPOSITORY],
})
export class ChoferesModule {}
