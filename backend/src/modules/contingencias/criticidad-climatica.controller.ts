import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { CriticidadClimaticaService } from './application/criticidad-climatica.service';
import { EdaClimaConsumer } from './infrastructure/eda-clima.consumer';
import {
  ResolverCriticidadDto,
  SimularCriticidadDto,
} from './application/dto/criticidad-climatica.dto';

@Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
@Controller('contingencias/clima')
export class CriticidadClimaticaController {
  constructor(
    private readonly clima: CriticidadClimaticaService,
    private readonly consumer: EdaClimaConsumer,
  ) {}
  @Get() async listar() {
    return { ...(await this.clima.listar()), integracion: this.consumer.estado() };
  }
  @Post('simulador') simular(@Body() dto: SimularCriticidadDto) {
    return this.clima.simular(dto);
  }
  @Patch(':id/resolver') resolver(
    @Param('id') id: string,
    @Body() dto: ResolverCriticidadDto,
    @Req() req: Request,
  ) {
    return this.clima.resolver(id, dto, req.usuario!.sub);
  }
}
