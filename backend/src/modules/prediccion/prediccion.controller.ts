import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { PrediccionService } from './application/prediccion.service';

/**
 * CU-12 · Predecir saturacion de contenedor.
 *
 * Cuelga de /contenedores porque la prediccion es una propiedad calculada del
 * contenedor, pero vive en su propio modulo: el modelo tiene reglas y evolucion
 * propias, y no tiene por que arrastrar al CRUD cada vez que cambie.
 */
@ApiTags('prediccion')
@ApiBearerAuth()
@Controller('contenedores')
export class PrediccionController {
  constructor(private readonly prediccion: PrediccionService) {}

  @Get(':id/prediccion')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'CU-12 · Estimar cuando el contenedor cruza el umbral de su zona' })
  @ApiResponse({ status: 200, description: 'Prediccion con su nivel de confianza' })
  @ApiResponse({ status: 404, description: 'El contenedor no existe' })
  @ApiResponse({
    status: 409,
    description:
      'SIN_LECTURAS_SUFICIENTES: no hay historico para ajustar. ' +
      'TENDENCIA_NO_CRECIENTE: el contenedor no se esta llenando.',
  })
  predecir(@Param('id', ParseUUIDPipe) id: string) {
    return this.prediccion.predecir(id);
  }
}
