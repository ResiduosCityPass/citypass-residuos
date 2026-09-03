import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { TipoResiduo } from '../../../../shared/domain/enums';

export class CrearContenedorDto {
  @ApiPropertyOptional({
    example: 'CT-0421',
    description: 'Codigo legible. Si no se envia, el sistema lo genera.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 20)
  codigo?: string;

  @ApiProperty({ description: 'Zona a la que pertenece; define los umbrales que se le aplican' })
  @IsUUID()
  zonaId!: string;

  @ApiProperty({ enum: TipoResiduo, example: TipoResiduo.RECICLABLE })
  @IsEnum(TipoResiduo)
  tipoResiduo!: TipoResiduo;

  @ApiProperty({ example: 1100, description: 'Capacidad en litros' })
  @IsInt()
  @Min(1)
  @Max(100000)
  capacidadLitros!: number;

  @ApiProperty({ example: -34.6118 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: -58.396 })
  @IsLongitude()
  lng!: number;
}
