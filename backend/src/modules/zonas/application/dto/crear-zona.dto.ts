import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { BARRIO_IDS } from '../../domain/barrios-caba';

export class CrearZonaDto {
  @ApiProperty({ example: 'Centro', description: 'Nombre del barrio o zona' })
  @IsString()
  @Length(2, 80)
  nombre!: string;

  @ApiPropertyOptional({
    type: [String],
    enum: BARRIO_IDS,
    description: 'Códigos del catálogo GET /barrios. Vacío permite revisión manual.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(BARRIO_IDS.length)
  @ArrayUnique()
  @IsIn(BARRIO_IDS, { each: true })
  barrioIds?: string[];

  @ApiProperty({
    example: 70,
    description:
      'Porcentaje de llenado a partir del cual un contenedor es critico. ' +
      'En el centro conviene 70; en zonas de baja densidad, 85 alcanza.',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  umbralCriticoPct!: number;

  @ApiProperty({
    example: 60,
    description: 'Temperatura interna en grados Celsius que dispara la alerta de incendio',
  })
  @IsInt()
  @Min(20)
  @Max(150)
  umbralTemperaturaC!: number;
}
