import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsNumber, Max, Min } from 'class-validator';

export class SimularLecturaDto {
  @ApiProperty({ example: 90, description: 'Porcentaje a registrar como una lectura real' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  nivelLlenadoPct!: number;

  @ApiProperty({ example: true, description: 'Confirmacion explicita del cambio de datos' })
  @Equals(true)
  confirmar!: boolean;
}
