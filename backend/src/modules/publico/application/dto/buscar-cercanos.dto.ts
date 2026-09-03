import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';
import { TipoResiduo } from '../../../../shared/domain/enums';

/** Radio por defecto: lo que alguien camina sin pensarlo. */
export const RADIO_DEFAULT_METROS = 1000;
export const RADIO_MAXIMO_METROS = 10000;

export class BuscarCercanosDto {
  @ApiProperty({ example: -34.6037, description: 'Latitud desde donde se busca' })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: -58.3816, description: 'Longitud desde donde se busca' })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({
    example: 1000,
    default: RADIO_DEFAULT_METROS,
    description: 'Radio de busqueda en metros',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(RADIO_MAXIMO_METROS)
  radioMetros?: number;

  @ApiPropertyOptional({ enum: TipoResiduo, example: TipoResiduo.RECICLABLE })
  @IsOptional()
  @IsEnum(TipoResiduo)
  tipoResiduo?: TipoResiduo;
}
