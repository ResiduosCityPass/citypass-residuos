import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const prefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // El frontend de Maximo corre en otro origen durante el desarrollo.
  app.enableCors({ origin: true, credentials: true });

  const swagger = new DocumentBuilder()
    .setTitle('CityPass+ · Gestion de Residuos Inteligente')
    .setDescription('Squad 4 — sensores, deteccion de alertas y recoleccion dinamica')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Sensor-Key', in: 'header' }, 'sensor-key')
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('PORT', 3000);
  // Explicitamente 0.0.0.0: los orquestadores enrutan el trafico desde afuera
  // del contenedor, y una aplicacion escuchando solo en loopback no recibe
  // nada. El sintoma es un despliegue que arranca bien y no responde jamas.
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API escuchando en http://localhost:${port}/${prefix}`);
  logger.log(`Swagger en http://localhost:${port}/docs`);
  logger.log(`Driver de eventos: ${config.get<string>('EVENT_BUS_DRIVER')}`);
}

void bootstrap();
