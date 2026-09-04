import { PartialType } from '@nestjs/swagger';
import { CrearChoferDto } from './crear-chofer.dto';

export class ActualizarChoferDto extends PartialType(CrearChoferDto) {}
