import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../shared/auth/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  /**
   * Publico a proposito: lo consultan el orquestador de contenedores y el
   * pipeline de CI/CD, que no tienen credenciales de usuario.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Estado del servicio' })
  check() {
    return {
      status: 'ok',
      service: 'residuos-service',
      timestamp: new Date().toISOString(),
    };
  }
}
