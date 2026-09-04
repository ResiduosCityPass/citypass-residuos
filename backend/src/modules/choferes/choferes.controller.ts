import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { ChoferesService } from './application/choferes.service';
import { ActualizarChoferDto } from './application/dto/actualizar-chofer.dto';
import { CrearChoferDto } from './application/dto/crear-chofer.dto';
import { FiltrarChoferesDto } from './application/dto/filtrar-choferes.dto';

/** CU-09 — Choferes. */
@ApiTags('choferes')
@ApiBearerAuth()
@Controller('choferes')
export class ChoferesController {
  constructor(private readonly choferes: ChoferesService) {}

  @Post()
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'CU-09 · Dar de alta un chofer' })
  @ApiResponse({ status: 409, description: 'CHOFER_LEGAJO_DUPLICADO' })
  crear(@Body() dto: CrearChoferDto) {
    return this.choferes.crear(dto);
  }

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'CU-09 · Listar choferes para asignarles una ruta' })
  @ApiResponse({
    status: 200,
    description: 'Solo los activos, salvo que se pida incluirInactivos=true',
  })
  listar(@Query() filtro: FiltrarChoferesDto) {
    return this.choferes.listar(filtro);
  }

  @Get(':id')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Detalle de un chofer' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.choferes.obtener(id);
  }

  @Patch(':id')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Editar nombre, legajo o la sesion asociada' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarChoferDto) {
    return this.choferes.actualizar(id, dto);
  }

  @Delete(':id')
  @Roles(Rol.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Baja logica del chofer' })
  darDeBaja(@Param('id', ParseUUIDPipe) id: string) {
    return this.choferes.darDeBaja(id);
  }
}
