import { PartialType } from '@nestjs/swagger';
import { CrearZonaDto } from './crear-zona.dto';

export class ActualizarZonaDto extends PartialType(CrearZonaDto) {}
