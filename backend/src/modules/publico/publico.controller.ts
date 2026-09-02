import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../shared/auth/public.decorator';
import { PublicoService } from './application/publico.service';
import { BuscarCercanosDto } from './application/dto/buscar-cercanos.dto';

/**
 * CU-11 — Consultar contenedores cercanos.
 *
 * Es el unico endpoint marcado `@Public()` del modulo, y esta documentado como
 * decision en el ADR-005: es informacion de servicio publico. Un vecino que
 * quiere saber donde tirar unas pilas no deberia necesitar una cuenta.
 */
@ApiTags('publico')
@Controller('publico')
export class PublicoController {
  constructor(private readonly publico: PublicoService) {}

  @Public()
  @Get('contenedores/cercanos')
  @ApiOperation({
    summary: 'CU-11 · Contenedores cercanos a un punto, ordenados por distancia',
  })
  @ApiResponse({
    status: 200,
    description: 'No expone nivel de llenado, estado ni alertas: es informacion operativa interna.',
  })
  buscarCercanos(@Query() filtro: BuscarCercanosDto) {
    return this.publico.buscarCercanos(filtro);
  }
}
