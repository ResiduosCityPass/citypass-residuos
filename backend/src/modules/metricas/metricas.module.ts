import { Module } from '@nestjs/common';
import { AnaliticaService } from './application/analitica.service';
import { MetricasController } from './metricas.controller';

@Module({
  controllers: [MetricasController],
  providers: [AnaliticaService],
})
export class MetricasModule {}
