import { OmitType, PartialType } from '@nestjs/swagger';
import { CrearContenedorDto } from './crear-contenedor.dto';

/** El codigo no se modifica: es el identificador operativo del contenedor. */
export class ActualizarContenedorDto extends PartialType(
  OmitType(CrearContenedorDto, ['codigo'] as const),
) {}
