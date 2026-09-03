import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { RutasService } from './application/rutas.service';
import { AsignarRutaDto } from './application/dto/asignar-ruta.dto';
import { FiltrarRutasDto } from './application/dto/filtrar-rutas.dto';
import { GenerarRutaDto } from './application/dto/generar-ruta.dto';

/** CU-08 y CU-09 — Generar y asignar rutas. */
@ApiTags('rutas')
@ApiBearerAuth()
@Controller('rutas')
export class RutasController {
  constructor(private readonly rutas: RutasService) {}

  @Post('generar')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'CU-08 · Proponer un recorrido para un camion' })
  @ApiResponse({ status: 201, description: 'La ruta nace PROPUESTA: no toma el camion todavia' })
  @ApiResponse({ status: 409, description: 'CAMION_NO_DISPONIBLE · RUTA_SIN_CONTENEDORES' })
  generar(@Body() dto: GenerarRutaDto) {
    return this.rutas.generar(dto);
  }

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Listar rutas' })
  listar(@Query() filtro: FiltrarRutasDto) {
    return this.rutas.listar(filtro);
  }

  /**
   * Antes que `:id` a proposito: si estuviera despues, Nest tomaria "mias"
   * como un id y el ParseUUIDPipe devolveria un 400 confuso.
   */
  @Get('mias')
  @Roles(Rol.CHOFER)
  @ApiOperation({ summary: 'CU-10 · Ruta activa del chofer autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Devuelve null si no tiene ruta activa: terminar el turno no es un error',
  })
  rutaPropia(@Req() request: Request) {
    // La identidad sale del token. Si viajara por query string, cualquier
    // chofer podria leer la ruta de otro cambiando un valor.
    return this.rutas.rutaActivaDe(request.usuario!.sub);
  }

  /**
   * Sin rol CHOFER a proposito.
   *
   * Este endpoint devuelve cualquier ruta por id y no verifica de quien es, asi
   * que darle acceso al chofer permitia que uno leyera la ruta de otro con solo
   * conocer el id: un IDOR. El chofer ya tiene `GET /rutas/mias`, que resuelve
   * su identidad desde el token y no acepta un id por parametro.
   *
   * Se saca el rol en vez de agregarle un chequeo de dueno porque ninguna
   * pantalla del chofer pega aca -la de CU-10 usa solo /rutas/mias-, y cerrar
   * una puerta que nadie usa es mas seguro que custodiarla.
   */
  @Get(':id')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Detalle de la ruta con camion y paradas' })
  @ApiResponse({ status: 403, description: 'El chofer consulta su ruta por GET /rutas/mias' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.rutas.obtener(id);
  }

  @Patch(':id/asignar')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'CU-09 · Confirmar la propuesta y asignarle chofer' })
  @ApiResponse({ status: 409, description: 'RUTA_NO_PROPUESTA' })
  asignar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AsignarRutaDto) {
    return this.rutas.asignar(id, dto);
  }
}
