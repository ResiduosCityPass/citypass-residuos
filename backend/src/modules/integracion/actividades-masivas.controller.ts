import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { IntegracionService } from './application/integracion.service';

/** Squad 3 — Zonas de actividades masivas de Espacios, para dibujar en el mapa. */
@ApiTags('Integracion CityPass+')
@ApiBearerAuth()
@Controller('actividades-masivas')
export class ActividadesMasivasController {
  constructor(private readonly integracion: IntegracionService) {}

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Actividades masivas en curso o recien terminadas, con su zona' })
  paraMapa() {
    return this.integracion.actividadesParaMapa();
  }
}
