import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

/**
 * Posicion del chofer al confirmar (CU-10).
 *
 * Se pide fresca en cada confirmacion: el chofer se movio entre una parada y la
 * siguiente.
 */
export class ConfirmarParadaDto {
  @ApiProperty({ example: -34.6037 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: -58.3816 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}
