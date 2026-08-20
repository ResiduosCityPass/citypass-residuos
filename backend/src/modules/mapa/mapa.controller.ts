import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
} from '../contenedores/domain/contenedor.repository';
import { FiltrarMapaDto } from './dto/filtrar-mapa.dto';

/**
 * CU-07 — Ver mapa en tiempo real.
 *
 * Devuelve un payload deliberadamente flaco: solo lo que hace falta para pintar
 * un marcador. El detalle completo se pide con `GET /contenedores/:id` al hacer
 * click, para no mandar toda la ciudad en cada refresco.
 */
@ApiTags('mapa')
@ApiBearerAuth()
@Controller('mapa')
export class MapaController {
  constructor(
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
  ) {}

  @Get('contenedores')
  @Roles(Rol.ADMINISTRADOR, Rol.OPERADOR)
  @ApiOperation({ summary: 'CU-07 · Contenedores con su estado, para pintar en el mapa' })
  async contenedoresParaMapa(@Query() filtro: FiltrarMapaDto) {
    const contenedores = await this.contenedores.listar({ ...filtro, soloActivos: true });

    return contenedores.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      lat: c.lat,
      lng: c.lng,
      estado: c.estado,
      tipoResiduo: c.tipoResiduo,
      nivelLlenadoPct: c.nivelLlenadoPct,
      ultimaLecturaEn: c.ultimaLecturaEn,
    }));
  }
}
