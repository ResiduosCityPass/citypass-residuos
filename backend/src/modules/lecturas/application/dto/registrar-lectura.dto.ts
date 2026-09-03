import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Cuerpo de `POST /lecturas` (CU-04).
 *
 * No lleva sensorId: la identidad sale del header X-Sensor-Key (ADR-005).
 */
export class RegistrarLecturaDto {
  @ApiProperty({ example: 87.4, description: 'Nivel de llenado en porcentaje' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  nivelLlenadoPct!: number;

  @ApiProperty({ example: 22.1, description: 'Temperatura interna en grados Celsius' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-50)
  @Max(300)
  temperaturaC!: number;

  @ApiProperty({ example: 64, description: 'Carga restante de la bateria del sensor' })
  @IsInt()
  @Min(0)
  @Max(100)
  bateriaPct!: number;

  @ApiPropertyOptional({
    example: '2026-09-15T14:32:10.482Z',
    description: 'Momento de la medicion. Si no se envia, se usa la hora de recepcion.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  registradaEn?: Date;
}
