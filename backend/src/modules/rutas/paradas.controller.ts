import { Body, Controller, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { ParadasService } from './application/paradas.service';
import { ConfirmarParadaDto } from './application/dto/confirmar-parada.dto';
import { OmitirParadaDto } from './application/dto/omitir-parada.dto';

/** CU-10 — Confirmar vaciado. */
@ApiTags('paradas')
@ApiBearerAuth()
@Controller('paradas')
export class ParadasController {
  constructor(private readonly paradas: ParadasService) {}

  @Patch(':id/confirmar')
  @Roles(Rol.CHOFER)
  @ApiOperation({ summary: 'CU-10 · Marcar la parada como vaciada' })
  @ApiResponse({
    status: 200,
    description:
      'Devuelve la transicion completa: parada, contenedor, alertas cerradas y estado de la ruta',
  })
  @ApiResponse({ status: 403, description: 'PARADA_FUERA_DE_RADIO · PARADA_DE_OTRA_RUTA' })
  @ApiResponse({ status: 409, description: 'PARADA_YA_CONFIRMADA · PARADA_YA_OMITIDA' })
  confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
    @Body() posicion: ConfirmarParadaDto,
  ) {
    return this.paradas.confirmar(id, request.usuario!.sub, posicion);
  }

  @Patch(':id/omitir')
  @Roles(Rol.CHOFER)
  @ApiOperation({ summary: 'CU-10 · El chofer llego pero no pudo vaciar' })
  @ApiResponse({
    status: 200,
    description:
      'El contenedor y sus alertas quedan como estaban. No exige estar dentro del radio.',
  })
  @ApiResponse({ status: 403, description: 'PARADA_DE_OTRA_RUTA' })
  @ApiResponse({ status: 409, description: 'PARADA_YA_CONFIRMADA · PARADA_YA_OMITIDA' })
  omitir(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
    @Body() dto: OmitirParadaDto,
  ) {
    return this.paradas.omitir(id, request.usuario!.sub, dto);
  }
}
