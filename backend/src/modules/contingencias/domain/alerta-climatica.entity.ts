import { Column, Entity, PrimaryColumn } from 'typeorm';
import { EstadoContingencia } from './contingencia.entity';
import {
  CriticidadConfirmadaDto,
  CriticidadFinalizadaDto,
} from '../application/dto/criticidad-climatica.dto';

@Entity('alerta_climatica_externa')
export class AlertaClimaticaExterna {
  /** Estado operativo proyectado al listar; no es una columna nueva. */
  estadoContingencia?: EstadoContingencia | null;

  @PrimaryColumn({ type: 'varchar', length: 200 }) alertaId!: string;
  @Column({ type: 'jsonb', nullable: true }) confirmacion!: CriticidadConfirmadaDto | null;
  @Column({ type: 'jsonb', nullable: true }) finalizacion!: CriticidadFinalizadaDto | null;
  @Column({ type: 'uuid', nullable: true }) contingenciaId!: string | null;
  @Column({ type: 'varchar', length: 25, default: 'PENDIENTE_REVISION' })
  decision!: 'PENDIENTE_REVISION' | 'SUSPENDER' | 'SIN_AFECTACION';
  @Column({ type: 'varchar', length: 300, nullable: true }) motivo!: string | null;
  @Column({ type: 'text', nullable: true }) revisadoPor!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) revisadaEn!: Date | null;
  @Column({ type: 'varchar', length: 15 }) origen!: 'eda' | 'simulador' | 'eda-simulacro';
  @Column({ type: 'timestamptz' }) recibidaEn!: Date;
}

export interface AlertaClimaticaRepository {
  buscar(id: string): Promise<AlertaClimaticaExterna | null>;
  listar(): Promise<AlertaClimaticaExterna[]>;
  guardar(alerta: AlertaClimaticaExterna): Promise<AlertaClimaticaExterna>;
}
export const ALERTA_CLIMATICA_REPOSITORY = Symbol('ALERTA_CLIMATICA_REPOSITORY');
