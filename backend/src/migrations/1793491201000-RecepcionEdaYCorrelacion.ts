import { MigrationInterface, QueryRunner } from 'typeorm';
export class RecepcionEdaYCorrelacion1793491201000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE contingencia ADD COLUMN "alertaId" uuid NULL');
    await q.query(`CREATE TABLE entrega_eda ("eventId" uuid PRIMARY KEY, huella varchar(64) NOT NULL,
      tipo varchar(200) NOT NULL, metadata jsonb NOT NULL, "procesadaEn" timestamptz NOT NULL)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE entrega_eda');
    await q.query('ALTER TABLE contingencia DROP COLUMN "alertaId"');
  }
}
