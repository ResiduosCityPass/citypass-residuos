import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class FiltrarChoferesDto {
  @ApiPropertyOptional({
    description: 'Incluir los dados de baja. Por defecto solo se listan los activos.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  incluirInactivos?: boolean;
}
