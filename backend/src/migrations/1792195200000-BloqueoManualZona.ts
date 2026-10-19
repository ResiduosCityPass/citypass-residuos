import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-INT-01: el bloqueo manual de una zona se guarda aparte del bloqueo por emergencia. */
export class BloqueoManualZona1792195200000 implements MigrationInterface {
  name = 'BloqueoManualZona1792195200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "zona" ADD "bloqueoManual" boolean NOT NULL DEFAULT false`,
    );
    // Hasta esta version solo un operador podia bloquear una zona.
    await queryRunner.query(`UPDATE "zona" SET "bloqueoManual" = "bloqueada"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "zona" DROP COLUMN "bloqueoManual"`);
  }
}
