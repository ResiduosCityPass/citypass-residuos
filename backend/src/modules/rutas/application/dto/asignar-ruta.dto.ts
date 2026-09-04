import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AsignarRutaDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Id del chofer, de los que devuelve GET /choferes. Se valida: si no existe, ' +
      '404 CHOFER_NO_ENCONTRADO; si esta dado de baja, 409 CHOFER_INACTIVO.',
  })
  @IsUUID()
  choferId!: string;
}
