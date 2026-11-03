import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlertasClimaticasExternas1793491200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE alerta_climatica_externa (
      "alertaId" uuid PRIMARY KEY,
      confirmacion jsonb NULL, finalizacion jsonb NULL,
      "contingenciaId" uuid NULL REFERENCES contingencia(id) ON DELETE RESTRICT,
      decision varchar(25) NOT NULL DEFAULT 'PENDIENTE_REVISION',
      motivo varchar(300) NULL, "revisadoPor" text NULL, "revisadaEn" timestamptz NULL,
      origen varchar(15) NOT NULL, "recibidaEn" timestamptz NOT NULL
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE alerta_climatica_externa');
  }
}
