import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';

@Controller('auth')
export class SesionController {
  // Requiere identidad valida; no requiere rol para poder informar que falta asignarlo.
  @Get('sesion')
  obtener(@Req() request: Request) {
    const usuario = request.usuario!;
    return {
      sub: usuario.sub,
      nombre: usuario.preferred_username || usuario.sub,
      rol: usuario.rol ?? null,
    };
  }
}
