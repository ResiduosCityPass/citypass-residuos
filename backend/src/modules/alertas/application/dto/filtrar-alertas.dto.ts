import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EstadoAlerta, Severidad, TipoAlerta } from '../../../../shared/domain/enums';

export class FiltrarAlertasDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contenedorId?: string;

  @ApiPropertyOptional({ enum: TipoAlerta })
  @IsOptional()
  @IsEnum(TipoAlerta)
  tipo?: TipoAlerta;

  @ApiPropertyOptional({ enum: Severidad })
  @IsOptional()
  @IsEnum(Severidad)
  severidad?: Severidad;

  @ApiPropertyOptional({ enum: EstadoAlerta })
  @IsOptional()
  @IsEnum(EstadoAlerta)
  estado?: EstadoAlerta;
}
