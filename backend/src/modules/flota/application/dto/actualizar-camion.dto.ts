import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { EstadoCamion } from '../../../../shared/domain/enums';
import { CrearCamionDto } from './crear-camion.dto';

/** Estados que una persona puede fijar a mano. EN_RUTA lo pone la asignacion de ruta. */
export const ESTADOS_MANUALES = [EstadoCamion.DISPONIBLE, EstadoCamion.MANTENIMIENTO] as const;

export class ActualizarCamionDto extends PartialType(CrearCamionDto) {
  @ApiPropertyOptional({
    enum: ESTADOS_MANUALES,
    description:
      'Solo DISPONIBLE o MANTENIMIENTO. EN_RUTA lo fija la asignacion de una ruta (CU-09).',
  })
  @IsOptional()
  @IsEnum(EstadoCamion)
  @IsIn(ESTADOS_MANUALES as unknown as EstadoCamion[], {
    message: 'estado solo puede fijarse a mano en DISPONIBLE o MANTENIMIENTO',
  })
  estado?: EstadoCamion;
}
