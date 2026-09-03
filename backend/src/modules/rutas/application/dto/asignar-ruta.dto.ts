import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AsignarRutaDto {
  @ApiProperty({
    example: 'U000042',
    description:
      'Identificador del chofer en el modulo de identidad del Squad 2 (el `sub` de su JWT). ' +
      'No se valida contra un padron propio: los usuarios no son entidades de este modulo.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  choferId!: string;
}
