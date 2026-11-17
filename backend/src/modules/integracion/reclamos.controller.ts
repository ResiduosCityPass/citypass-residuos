import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { ReclamosService } from './application/reclamos.service';

/** CU-INT-02 · Lo que Residuos hizo con los reclamos de autos. */
@ApiTags('reclamos')
@ApiBearerAuth()
@Controller('reclamos')
export class ReclamosController {
  constructor(private readonly reclamos: ReclamosService) {}

  @Get('metrica')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Porcentaje de reclamos evaluados que tapan un contenedor' })
  @ApiQuery({ name: 'desde', required: false, description: 'ISO-8601. Sin esto, desde siempre.' })
  metrica(@Query('desde') desde?: string) {
    const momento = desde ? new Date(desde) : null;

    if (momento && Number.isNaN(momento.getTime())) {
      throw new BadRequestException({ message: "'desde' no es una fecha", code: 'FECHA_INVALIDA' });
    }

    return this.reclamos.metrica(momento);
  }
}
