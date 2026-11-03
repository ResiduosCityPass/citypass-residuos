import { Column, Entity, PrimaryColumn } from 'typeorm';
@Entity('entrega_eda')
export class EntregaEda {
  @PrimaryColumn('uuid') eventId!: string;
  @Column({ length: 64 }) huella!: string;
  @Column({ length: 200 }) tipo!: string;
  @Column({ type: 'jsonb' }) metadata!: Record<string, unknown>;
  @Column({ type: 'timestamptz' }) procesadaEn!: Date;
}
