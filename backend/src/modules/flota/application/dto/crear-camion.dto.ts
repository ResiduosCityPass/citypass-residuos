import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { TipoResiduo } from '../../../../shared/domain/enums';

/**
 * El estado no se puede elegir en el alta: todo camion nace DISPONIBLE.
 * Dar de alta un camion directamente EN_RUTA no significaria nada, porque no
 * hay ninguna ruta a la que pertenezca.
 */
export class CrearCamionDto {
  @ApiProperty({ example: 'AB123CD', description: 'Se guarda en mayusculas y sin espacios' })
  @IsString()
  @Length(6, 20)
  patente!: string;

  @ApiProperty({ example: 12000, description: 'Capacidad de carga en litros' })
  @IsInt()
  @Min(1000)
  @Max(40000)
  capacidadLitros!: number;

  @ApiProperty({
    enum: TipoResiduo,
    example: TipoResiduo.RECICLABLE,
    description: 'Que tipo de residuo puede transportar. Decide que contenedores puede levantar',
  })
  @IsEnum(TipoResiduo)
  tipoResiduoHabilitado!: TipoResiduo;
}
