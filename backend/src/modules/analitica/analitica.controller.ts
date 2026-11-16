import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsBoolean, IsOptional } from 'class-validator';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Public } from '../../shared/auth/public.decorator';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { COOKIE_ANALITICA } from './analitica-cookie.middleware';
import { AnaliticaIframeFilter } from './analitica-iframe.filter';
import { AnaliticaService } from './analitica.service';

export class CrearTableroDto {
  @IsOptional() @IsBoolean() verificar?: boolean;
}

@Controller('metricas')
@Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
export class AnaliticaController {
  constructor(
    private readonly analitica: AnaliticaService,
    private readonly config: ConfigService,
  ) {}

  @Post('tableros')
  @Header('Cache-Control', 'private, no-store')
  async crear(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() input: CrearTableroDto,
  ) {
    this.exigirCuenta(request);
    this.analitica.validarConfiguracion();
    const remaining = request.usuario!.exp * 1000 - Date.now();
    if (remaining < 5000) throw new UnauthorizedException('La sesión debe renovarse.');
    // Solo ante un 401 del iframe: el cliente compartido hace un refresh y
    // reintenta una vez. No se guarda ni se devuelve HTML desde este endpoint.
    if (input?.verificar) await this.analitica.tablero(request.headers.authorization!);
    const vistaId = randomUUID();
    const url = this.ruta(vistaId);
    response.cookie(COOKIE_ANALITICA, request.headers.authorization!.split(' ')[1], {
      httpOnly: true,
      secure: this.esProduccion(),
      sameSite: 'strict',
      path: url,
      maxAge: Math.min(remaining, 120000),
    });
    // El id es solo una ruta: sin cookie valida y permisos no permite ver HTML.
    // Un path por vista evita mezclar sesiones entre pestañas y cuentas.
    return { vistaId, url };
  }

  @Get('tableros/:vistaId')
  @UseFilters(AnaliticaIframeFilter)
  async obtener(
    @Param('vistaId', new ParseUUIDPipe({ version: '4' })) _id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.exigirCuenta(request);
    const { body, headers } = await this.analitica.tablero(request.headers.authorization!);
    response.status(200).set(headers).set('Vary', 'Cookie, Authorization').send(body);
  }

  /** Solo elimina la cookie de esta vista en este navegador; nunca entrega datos. */
  @Delete('tableros/:vistaId')
  @Public()
  @Roles()
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  borrar(
    @Param('vistaId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie(COOKIE_ANALITICA, {
      path: this.ruta(id),
      httpOnly: true,
      secure: this.esProduccion(),
      sameSite: 'strict',
    });
  }

  private exigirCuenta(request: Request) {
    if (request.usuario?.token_use !== 'human' || request.usuario.module !== 'residuos') {
      throw new ForbiddenException('El tablero requiere una cuenta de Residuos de Login Federado.');
    }
  }

  private ruta(id: string) {
    const prefix = this.config
      .get<string>('API_PREFIX', 'api/v1')
      .split('/')
      .filter(Boolean)
      .join('/');
    return `${prefix ? '/' + prefix : ''}/metricas/tableros/${id}`;
  }

  private esProduccion() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
