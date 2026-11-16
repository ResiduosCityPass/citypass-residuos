import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AnaliticaController } from './analitica.controller';
import { AnaliticaService } from './analitica.service';
import { AnaliticaCookieMiddleware } from './analitica-cookie.middleware';

@Module({ controllers: [AnaliticaController], providers: [AnaliticaService] })
export class AnaliticaModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AnaliticaCookieMiddleware).forRoutes({
      path: 'metricas/tableros/:vistaId',
      method: RequestMethod.GET,
    });
  }
}
