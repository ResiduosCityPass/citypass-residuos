import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contenedor } from '../contenedores/domain/contenedor.entity';
import { PublicoService } from './application/publico.service';
import { CONTENEDOR_CERCANO_REPOSITORY } from './domain/contenedor-cercano.repository';
import { ContenedorCercanoTypeormRepository } from './infrastructure/contenedor-cercano.typeorm.repository';
import { PublicoController } from './publico.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Contenedor])],
  controllers: [PublicoController],
  providers: [
    PublicoService,
    { provide: CONTENEDOR_CERCANO_REPOSITORY, useClass: ContenedorCercanoTypeormRepository },
  ],
})
export class PublicoModule {}
