import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { AlertasService } from './application/alertas.service';
import { FiltrarAlertasDto } from './application/dto/filtrar-alertas.dto';

/** CU-05 y CU-06 — Tablero de alertas del operador. */
@ApiTags('alertas')
@ApiBearerAuth()
@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Listar alertas con filtros' })
  listar(@Query() filtro: FiltrarAlertasDto) {
    return this.alertas.listar(filtro);
  }

  @Get(':id')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Detalle de una alerta' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertas.obtener(id);
  }

  @Patch(':id/atender')
  @Roles(Rol.OPERADOR, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Tomar la alerta: pasa a EN_ATENCION' })
  atender(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertas.atender(id);
  }

  @Patch(':id/resolver')
  @Roles(Rol.OPERADOR, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Cerrar la alerta' })
  resolver(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertas.resolver(id);
  }
}
