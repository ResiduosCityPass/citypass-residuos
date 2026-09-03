import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/**
 * Motivo por el que la parada no se pudo vaciar (CU-10).
 *
 * El motivo es obligatorio: una parada omitida sin explicacion deja al operador
 * sin la unica informacion que necesita para decidir si vuelve a rutear ese
 * contenedor hoy o si el problema es de la calle y no del camion.
 */
export class OmitirParadaDto {
  @ApiProperty({
    example: 'Auto mal estacionado tapando el contenedor',
    description: 'Por que no se pudo vaciar',
  })
  @IsString()
  @Length(3, 200)
  motivo!: string;
}
