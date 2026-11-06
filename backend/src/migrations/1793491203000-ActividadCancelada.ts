import { MigrationInterface, QueryRunner } from 'typeorm';

/** Squad 6: cancelaciones de Espacios, que pueden llegar antes que la creacion. */
export class ActividadCancelada1793491203000 implements MigrationInterface {
  name = 'ActividadCancelada1793491203000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "actividad_cancelada" ("actividadId" character varying(64) NOT NULL, "canceladaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_actividad_cancelada" PRIMARY KEY ("actividadId"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "actividad_cancelada"`);
  }
}
