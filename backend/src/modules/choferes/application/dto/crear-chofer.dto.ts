import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CrearChoferDto {
  @ApiProperty({ example: 'Juana Perez' })
  @IsString()
  @Length(2, 120)
  nombre!: string;

  @ApiProperty({ example: 'CH-014', description: 'Legajo o documento. Unico.' })
  @IsString()
  @Length(2, 40)
  legajo!: string;

  @ApiPropertyOptional({
    example: 'dev-chofer',
    description:
      'Identificador de la sesion con la que este chofer entra a la pantalla de CU-10. ' +
      'Se puede cargar despues: sin el, el chofer existe y se le pueden asignar rutas, ' +
      'pero no ve la suya.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  usuarioSub?: string;
}
