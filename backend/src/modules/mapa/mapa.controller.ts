import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { MapaService } from './application/mapa.service';
import { FiltrarMapaDto } from './dto/filtrar-mapa.dto';

/** CU-07 — Ver mapa en tiempo real. */
@ApiTags('mapa')
@ApiBearerAuth()
@Controller('mapa')
export class MapaController {
  constructor(private readonly mapa: MapaService) {}

  @Get('contenedores')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'CU-07 · Contenedores con su estado, para pintar en el mapa' })
  contenedoresParaMapa(@Query() filtro: FiltrarMapaDto) {
    return this.mapa.marcadores(filtro);
  }
}
