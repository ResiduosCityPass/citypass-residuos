import { Controller, ForbiddenException, Get, Header, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { AnaliticaService } from './analitica.service';

@Controller('metricas')
@Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
export class AnaliticaController {
  constructor(private readonly analitica: AnaliticaService) {}

  @Get('tablero')
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Authorization')
  obtener(@Req() request: Request) {
    // Los guards verificaron firma y rol. Tampoco se permiten identidades de
    // chofer o servicio aunque se les asignaran grupos operativos.
    if (request.usuario?.token_use !== 'human' || request.usuario.module !== 'residuos') {
      throw new ForbiddenException('El tablero requiere una cuenta de Residuos de Login Federado.');
    }
    // JSON evita ejecutar HTML del proveedor como una pagina del origen API.
    return this.analitica.tablero(request.headers.authorization!);
  }
}
