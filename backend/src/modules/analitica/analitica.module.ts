import { Module } from '@nestjs/common';
import { AnaliticaController } from './analitica.controller';
import { AnaliticaService } from './analitica.service';

@Module({ controllers: [AnaliticaController], providers: [AnaliticaService] })
export class AnaliticaModule {}
