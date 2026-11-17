import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { BARRIOS_CABA } from './domain/barrios-caba';

@ApiTags('zonas')
@ApiBearerAuth()
@Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
@Controller('barrios')
export class BarriosController {
  @Get()
  listar() {
    return BARRIOS_CABA;
  }
}
