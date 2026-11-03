import { Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { IntervencionesService } from './application/intervenciones.service';

/** Intervenciones programadas por emergencias con causa RESIDUOS. */
@ApiTags('intervenciones')
@ApiBearerAuth()
@Controller('intervenciones')
export class IntervencionesController {
  constructor(private readonly intervenciones: IntervencionesService) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Listar intervenciones, las mas recientes primero' })
  listar() {
    return this.intervenciones.listar();
  }

  @Get(':id')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Detalle de una intervencion' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.intervenciones.obtener(id);
  }

  @Patch(':id/completar')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Marcar la intervencion como completada' })
  completar(@Param('id', ParseUUIDPipe) id: string) {
    return this.intervenciones.completar(id);
  }
}
