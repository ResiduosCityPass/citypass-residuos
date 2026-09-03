import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { hashearApiKey } from '../../modules/contenedores/domain/api-key';
import { Sensor } from '../../modules/contenedores/domain/sensor.entity';
import {
  SENSOR_REPOSITORY,
  SensorRepository,
} from '../../modules/contenedores/domain/sensor.repository';

declare module 'express' {
  interface Request {
    sensor?: Sensor;
  }
}

/**
 * Autenticacion de dispositivos IoT (ADR-005).
 *
 * Un sensor no atraviesa un flujo de login interactivo ni deberia portar un token
 * con claims de persona: se identifica con una API key propia en el header
 * `X-Sensor-Key`.
 *
 * La identidad sale de la credencial, nunca del body. Asi un sensor no puede
 * reportar lecturas en nombre de otro.
 */
@Injectable()
export class SensorKeyGuard implements CanActivate {
  constructor(
    @Inject(SENSOR_REPOSITORY)
    private readonly sensores: SensorRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-sensor-key'];

    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      throw new UnauthorizedException({
        message: 'Falta el header X-Sensor-Key',
        code: 'SENSOR_KEY_AUSENTE',
      });
    }

    const sensor = await this.sensores.buscarPorApiKeyHash(hashearApiKey(apiKey));

    if (!sensor) {
      throw new UnauthorizedException({
        message: 'API key de sensor invalida',
        code: 'SENSOR_KEY_INVALIDA',
      });
    }

    request.sensor = sensor;

    return true;
  }
}
