import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const CRITICIDAD_CONFIRMADA = 'com.citypass.espacios.CriticidadClimaticaConfirmada';
export const CRITICIDAD_FINALIZADA = 'com.citypass.espacios.CriticidadClimaticaFinalizada';

class UbicacionClimaticaDto {
  @IsNumber() @IsLatitude() latitud!: number;
  @IsNumber() @IsLongitude() longitud!: number;
}

export class CriticidadFinalizadaDto {
  @IsString() @Length(1, 200) alertaId!: string;
  @IsInt() @Min(0) @Max(8640000000000000) finalizadaEn!: number;
  @IsString() @Length(1, 200) actorSub!: string;
}

export class CriticidadConfirmadaDto {
  @IsString() @Length(1, 200) alertaId!: string;
  // El catalogo completo aun no fue acordado: se conserva el valor para revision humana.
  @IsString() @Length(1, 40) nivelCriticidad!: string;
  @IsString() @Length(1, 80) fenomeno!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UbicacionClimaticaDto)
  ubicaciones!: UbicacionClimaticaDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  barrios?: string[];
  @IsInt() @Min(0) @Max(8640000000000000) vigenciaDesde!: number;
  @IsInt() @Min(0) @Max(8640000000000000) vigenciaHasta!: number;
  @IsString() @Length(1, 200) actorSub!: string;
  @IsOptional() @IsNumber() temperaturaMinC?: number | null;
  @IsOptional() @IsNumber() temperaturaMaxC?: number | null;
}

/** Sobre local del simulador. No pretende ser el sobre de entrega de EDA. */
export class SimularCriticidadDto {
  @IsIn([CRITICIDAD_CONFIRMADA, CRITICIDAD_FINALIZADA]) tipo!: string;
  @IsDefined() @IsObject() payload!: Record<string, unknown>;
}

export class ResolverCriticidadDto {
  @IsIn(['SUSPENDER', 'SIN_AFECTACION']) accion!: 'SUSPENDER' | 'SIN_AFECTACION';
  @IsString() @Length(10, 300) motivo!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  zonaIds?: string[];
}
