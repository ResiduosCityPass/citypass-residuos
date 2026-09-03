import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { EstadoCamion, TipoResiduo } from '../../../../shared/domain/enums';

export class FiltrarCamionesDto {
  @ApiPropertyOptional({ enum: EstadoCamion })
  @IsOptional()
  @IsEnum(EstadoCamion)
  estado?: EstadoCamion;

  @ApiPropertyOptional({ enum: TipoResiduo })
  @IsOptional()
  @IsEnum(TipoResiduo)
  tipoResiduoHabilitado?: TipoResiduo;
}
