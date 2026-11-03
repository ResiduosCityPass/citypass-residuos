import { MigrationInterface, QueryRunner } from 'typeorm';
export class AlertaExternaIdentificadorTexto1793491202000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE alerta_climatica_externa ALTER COLUMN "alertaId" TYPE varchar(200) USING "alertaId"::text',
    );
    await q.query(
      'ALTER TABLE contingencia ALTER COLUMN "alertaId" TYPE varchar(200) USING "alertaId"::text',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    // Falla explicitamente si existen IDs no UUID: no elimina registros para forzar el rollback.
    await q.query(
      'ALTER TABLE contingencia ALTER COLUMN "alertaId" TYPE uuid USING "alertaId"::uuid',
    );
    await q.query(
      'ALTER TABLE alerta_climatica_externa ALTER COLUMN "alertaId" TYPE uuid USING "alertaId"::uuid',
    );
  }
}
