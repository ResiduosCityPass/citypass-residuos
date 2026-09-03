import { MigrationInterface, QueryRunner } from 'typeorm';

export class OmitirParadaYMotivo1788461790466 implements MigrationInterface {
  name = 'OmitirParadaYMotivo1788461790466';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "parada" ADD "omitidaEn" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "parada" ADD "motivo" character varying(200)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "parada" DROP COLUMN "motivo"`);
    await queryRunner.query(`ALTER TABLE "parada" DROP COLUMN "omitidaEn"`);
  }
}
