import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { TipoResiduo } from '../../../../shared/domain/enums';

/**
 * Formato Mercosur (2 letras, 3 numeros, 2 letras), tolerando mayus/minuscula y
 * espacios sueltos entre los grupos: eso es lo que `normalizarPatente` limpia
 * despues. La regex valida la FORMA, no reemplaza la normalizacion -- rechaza
 * "PATENTE1" o "ABC123", no le exige a quien tipea que ya venga en mayusculas.
 */
const FORMATO_PATENTE_MERCOSUR = /^\s*[A-Za-z]{2}\s*\d{3}\s*[A-Za-z]{2}\s*$/;

/**
 * El estado no se puede elegir en el alta: todo camion nace DISPONIBLE.
 * Dar de alta un camion directamente EN_RUTA no significaria nada, porque no
 * hay ninguna ruta a la que pertenezca.
 */
export class CrearCamionDto {
  @ApiProperty({
    example: 'AB123CD',
    description: 'Formato Mercosur. Se guarda en mayusculas y sin espacios',
  })
  @IsString()
  @Length(6, 20)
  @Matches(FORMATO_PATENTE_MERCOSUR, {
    message: 'patente debe tener el formato Mercosur, por ejemplo AB123CD',
  })
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
