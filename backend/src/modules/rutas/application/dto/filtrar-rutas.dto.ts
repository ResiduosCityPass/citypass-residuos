import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EstadoRuta } from '../../../../shared/domain/enums';

export class FiltrarRutasDto {
  @ApiPropertyOptional({ enum: EstadoRuta })
  @IsOptional()
  @IsEnum(EstadoRuta)
  estado?: EstadoRuta;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  camionId?: string;
}
