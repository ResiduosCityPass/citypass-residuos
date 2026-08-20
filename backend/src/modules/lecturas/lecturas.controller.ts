import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../shared/auth/public.decorator';
import { SensorKeyGuard } from '../../shared/auth/sensor-key.guard';
import { LecturasService } from './application/lecturas.service';
import { RegistrarLecturaDto } from './application/dto/registrar-lectura.dto';

/**
 * CU-04 — Reportar nivel de llenado.
 *
 * `@Public()` saltea el guard de JWT (los sensores no tienen sesion de usuario) y
 * en su lugar corre SensorKeyGuard. No queda desprotegido: cambia el mecanismo,
 * no la exigencia.
 */
@ApiTags('lecturas')
@ApiSecurity('sensor-key')
@Controller('lecturas')
export class LecturasController {
  constructor(private readonly lecturas: LecturasService) {}

  @Public()
  @UseGuards(SensorKeyGuard)
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'CU-04 · Registrar una lectura de sensor' })
  @ApiResponse({ status: 202, description: 'Lectura aceptada y reglas evaluadas' })
  @ApiResponse({ status: 401, description: 'X-Sensor-Key ausente o invalida' })
  @ApiResponse({ status: 409, description: 'La lectura llega fuera de orden cronologico' })
  registrar(@Req() request: Request, @Body() dto: RegistrarLecturaDto) {
    return this.lecturas.registrar(request.sensor!, dto);
  }
}
