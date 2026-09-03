import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class GenerarRutaDto {
  @ApiProperty({ description: 'Camion para el que se arma la propuesta' })
  @IsUUID()
  camionId!: string;

  @ApiPropertyOptional({ description: 'Limitar la propuesta a una zona' })
  @IsOptional()
  @IsUUID()
  zonaId?: string;
}
