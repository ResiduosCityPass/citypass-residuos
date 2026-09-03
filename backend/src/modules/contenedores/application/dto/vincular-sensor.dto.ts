import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class VincularSensorDto {
  @ApiPropertyOptional({
    example: 'SN-0421',
    description: 'Codigo del sensor. Si no se envia, el sistema lo genera.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 20)
  codigo?: string;
}
