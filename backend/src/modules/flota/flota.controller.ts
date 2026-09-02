import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { FlotaService } from './application/flota.service';
import { ActualizarCamionDto } from './application/dto/actualizar-camion.dto';
import { CrearCamionDto } from './application/dto/crear-camion.dto';
import { FiltrarCamionesDto } from './application/dto/filtrar-camiones.dto';

/**
 * CU-03 — Gestionar flota.
 *
 * No expone DELETE, y es deliberado: un camion borrado seguiria colgando de las
 * rutas historicas que ejecuto. Para sacarlo de circulacion se lo pasa a
 * MANTENIMIENTO.
 */
@ApiTags('flota')
@ApiBearerAuth()
@Controller('camiones')
export class FlotaController {
  constructor(private readonly flota: FlotaService) {}

  @Post()
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'CU-03 · Dar de alta un camion' })
  @ApiResponse({ status: 201, description: 'El camion nace DISPONIBLE' })
  @ApiResponse({ status: 409, description: 'CAMION_PATENTE_DUPLICADA' })
  crear(@Body() dto: CrearCamionDto) {
    return this.flota.crear(dto);
  }

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Listar la flota, con filtros por estado y tipo de residuo' })
  listar(@Query() filtro: FiltrarCamionesDto) {
    return this.flota.listar(filtro);
  }

  @Patch(':id')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'CU-03 · Editar el camion o mandarlo a mantenimiento' })
  @ApiResponse({ status: 409, description: 'CAMION_EN_RUTA · CAMION_PATENTE_DUPLICADA' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCamionDto) {
    return this.flota.actualizar(id, dto);
  }
}
