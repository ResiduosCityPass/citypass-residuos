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
import { ContenedoresService } from './application/contenedores.service';
import { ActualizarContenedorDto } from './application/dto/actualizar-contenedor.dto';
import { CrearContenedorDto } from './application/dto/crear-contenedor.dto';
import { FiltrarContenedoresDto } from './application/dto/filtrar-contenedores.dto';
import { VincularSensorDto } from './application/dto/vincular-sensor.dto';

/** CU-01 — Registrar contenedor y sensor. */
@ApiTags('contenedores')
@ApiBearerAuth()
@Controller('contenedores')
export class ContenedoresController {
  constructor(private readonly contenedores: ContenedoresService) {}

  @Post()
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'CU-01 · Dar de alta un contenedor' })
  crear(@Body() dto: CrearContenedorDto) {
    return this.contenedores.crear(dto);
  }

  @Get()
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Listar contenedores activos con filtros' })
  listar(@Query() filtro: FiltrarContenedoresDto) {
    return this.contenedores.listar(filtro);
  }

  @Get(':id')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'Detalle del contenedor, con su zona y su sensor' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.contenedores.obtener(id);
  }

  @Patch(':id')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Editar ubicacion, capacidad, tipo de residuo o zona' })
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarContenedorDto) {
    return this.contenedores.actualizar(id, dto);
  }

  @Delete(':id')
  @Roles(Rol.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Baja logica del contenedor' })
  darDeBaja(@Param('id', ParseUUIDPipe) id: string) {
    return this.contenedores.darDeBaja(id);
  }

  @Post(':id/sensor')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'CU-01 · Vincular un sensor al contenedor' })
  @ApiResponse({
    status: 201,
    description:
      'Devuelve la API key en claro. Es la unica vez que se muestra: se guarda hasheada.',
  })
  async vincularSensor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VincularSensorDto) {
    const { sensor, apiKey } = await this.contenedores.vincularSensor(id, dto);

    return {
      sensorId: sensor.id,
      codigo: sensor.codigo,
      contenedorId: sensor.contenedorId,
      apiKey,
      advertencia: 'Guardala ahora: no se puede volver a consultar.',
    };
  }
}
