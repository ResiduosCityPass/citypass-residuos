import { MigrationInterface, QueryRunner } from 'typeorm';

/** Squad 6: actividades que Espacios suspendio y todavia puede reanudar. */
export class ActividadSuspendida1793491205000 implements MigrationInterface {
  name = 'ActividadSuspendida1793491205000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "actividad_suspendida" ("actividadId" character varying(64) NOT NULL, "suspendidaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_actividad_suspendida" PRIMARY KEY ("actividadId"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "actividad_suspendida"`);
  }
}
