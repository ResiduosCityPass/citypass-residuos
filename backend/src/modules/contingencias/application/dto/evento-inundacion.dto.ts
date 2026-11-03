import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
  IsDefined,
  IsOptional,
} from 'class-validator';

export const EVENTO_INICIO = 'espaciospublicos.inundacion.iniciada';
export const EVENTO_FIN = 'espaciospublicos.inundacion.finalizada';

export class SimularInundacionDto {
  @ApiProperty({ example: 'Inundacion en Centro', minLength: 3, maxLength: 200 })
  @IsString()
  @Length(3, 200)
  descripcion!: string;
  /** Provisional: UUID locales; el adaptador EDA resolvera los codigos compartidos. */
  @ApiProperty({
    type: String,
    isArray: true,
    description: 'UUID v4 de zonas locales de Residuos. Entre 1 y 100, sin repetidos.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  zonaIds!: string[];
}

export class PayloadInundacionDto extends SimularInundacionDto {
  @IsOptional() @IsString() @Length(1, 200) alertaId?: string;
  @IsOptional() @IsString() @Length(1, 200) actorSub?: string;
  @IsUUID('4') inundacionId!: string;
  /** Version de la ocurrencia, independiente de la version del esquema. */
  @IsInt() @Min(1) revision!: number;
}

export class EventoInundacionDto {
  @IsUUID('4') eventId!: string;
  @IsIn([EVENTO_INICIO, EVENTO_FIN]) eventType!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @Equals('espaciospublicos-service') source!: string;
  @Equals(1) version!: number;
  @IsUUID('4') correlationId!: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => PayloadInundacionDto)
  payload!: PayloadInundacionDto;
}
