import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EstadoContenedor, TipoResiduo } from '../../../../shared/domain/enums';

export class FiltrarContenedoresDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  zonaId?: string;

  @ApiPropertyOptional({ enum: TipoResiduo })
  @IsOptional()
  @IsEnum(TipoResiduo)
  tipoResiduo?: TipoResiduo;

  @ApiPropertyOptional({ enum: EstadoContenedor })
  @IsOptional()
  @IsEnum(EstadoContenedor)
  estado?: EstadoContenedor;
}
