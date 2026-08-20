import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class CrearZonaDto {
  @ApiProperty({ example: 'Centro', description: 'Nombre del barrio o zona' })
  @IsString()
  @Length(2, 80)
  nombre!: string;

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
