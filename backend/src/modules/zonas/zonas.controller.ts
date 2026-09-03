import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Rol } from '../../shared/domain/enums';
import { Roles } from '../../shared/auth/roles.decorator';
import { ZonasService } from './application/zonas.service';
import { ActualizarZonaDto } from './application/dto/actualizar-zona.dto';
import { CrearZonaDto } from './application/dto/crear-zona.dto';

/** CU-02 — Definir zonas y umbrales. Solo traduce HTTP a casos de uso. */
@ApiTags('zonas')
@ApiBearerAuth()
@Controller('zonas')
export class ZonasController {
  constructor(private readonly zonas: ZonasService) {}

  @Post()
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'CU-02 · Crear una zona con sus umbrales' })
  crear(@Body() dto: CrearZonaDto) {
    return this.zonas.crear(dto);
  }

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Listar zonas' })
  listar() {
    return this.zonas.listar();
  }

  @Get(':id')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Detalle de una zona' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.zonas.obtener(id);
  }

  @Patch(':id')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'CU-02 · Modificar nombre o umbrales' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarZonaDto) {
    return this.zonas.actualizar(id, dto);
  }

  @Patch(':id/bloqueo')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Bloquear o desbloquear la zona para el ruteo' })
  cambiarBloqueo(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('bloqueada', ParseBoolPipe) bloqueada: boolean,
  ) {
    return this.zonas.cambiarBloqueo(id, bloqueada);
  }

  @Delete(':id')
  @Roles(Rol.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una zona sin contenedores asociados' })
  eliminar(@Param('id', ParseUUIDPipe) id: string) {
    return this.zonas.eliminar(id);
  }
}
