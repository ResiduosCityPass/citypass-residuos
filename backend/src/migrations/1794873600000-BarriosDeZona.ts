import { MigrationInterface, QueryRunner } from 'typeorm';

/** Conserva zonas, identificadores, umbrales y restricciones existentes. */
export class BarriosDeZona1794873600000 implements MigrationInterface {
  name = 'BarriosDeZona1794873600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "zona" ADD "barrioIds" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "zona" DROP COLUMN "barrioIds"`);
  }
}
