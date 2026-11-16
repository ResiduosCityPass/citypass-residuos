import { Controller, Get, Header, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { AnaliticaService } from './application/analitica.service';

/** Metricas de Residuos: el tablero que arma Analitica. */
@ApiTags('metricas')
@ApiBearerAuth()
@Controller('metricas')
export class MetricasController {
  constructor(private readonly analitica: AnaliticaService) {}

  // Solo el admin: Analitica pide que su tablero lo vea el administrador del modulo.
  @Get('analitica')
  @Roles(Rol.ADMINISTRADOR)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Tablero de Analitica de Residuos, pedido con el token del admin' })
  tablero(@Headers('authorization') autorizacion: string) {
    // El guard global ya verifico que viene un Bearer valido.
    return this.analitica.tablero(autorizacion);
  }
}
