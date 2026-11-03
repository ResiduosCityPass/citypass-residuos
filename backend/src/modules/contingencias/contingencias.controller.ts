import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { ContingenciasService } from './application/contingencias.service';
import { SimularInundacionDto } from './application/dto/evento-inundacion.dto';

@ApiTags('contingencias')
@ApiBearerAuth()
@Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
@Controller('contingencias')
export class ContingenciasController {
  constructor(private readonly contingencias: ContingenciasService) {}
  @Get()
  @ApiOperation({ summary: 'Inundaciones, restricciones y avance de recuperacion' })
  listar() {
    return this.contingencias.listar();
  }
  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.contingencias.obtener(id);
  }
  @Post('simulador/inicio')
  @ApiOperation({ summary: 'Simular el inicio de una inundacion (solo desarrollo/test)' })
  iniciar(@Body() dto: SimularInundacionDto) {
    return this.contingencias.simularInicio(dto);
  }
  @Post('simulador/:id/finalizacion')
  finalizar(@Param('id', ParseUUIDPipe) id: string) {
    return this.contingencias.simularFinalizacion(id);
  }
  @Patch(':id/recuperar')
  @ApiOperation({ summary: 'Habilitar la recuperacion tras finalizar la inundacion' })
  recuperar(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.contingencias.habilitarRecuperacion(id, req.usuario!.sub);
  }
}
