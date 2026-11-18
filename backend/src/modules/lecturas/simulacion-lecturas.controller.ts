import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { SimularLecturaDto } from './application/dto/simular-lectura.dto';
import { LecturasService } from './application/lecturas.service';

/** La simulacion usa identidad humana administradora; nunca expone la clave IoT. */
@ApiTags('lecturas')
@ApiBearerAuth()
@Roles(Rol.ADMINISTRADOR)
@Controller('contenedores')
export class SimulacionLecturasController {
  constructor(private readonly lecturas: LecturasService) {}

  @Post(':id/lecturas/simulacion')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Registrar una lectura de prueba confirmada (solo administrador)' })
  @ApiResponse({ status: 202, description: 'Lectura registrada con las reglas de ingesta reales' })
  @ApiResponse({
    status: 409,
    description: 'Sin sensor, fuera de servicio o lectura fuera de orden',
  })
  simular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SimularLecturaDto,
    @Req() req: Request,
  ) {
    return this.lecturas.simular(id, dto.nivelLlenadoPct, req.usuario!.sub);
  }
}
